#!/usr/bin/env bash
#
# ccwy_blog —— 生产 Nginx 加固脚本
#
# 作用：把 /etc/nginx/sites-available/blog 替换成一份加固后的配置，包括
#   · HSTS / nosniff / X-Frame-Options / Referrer-Policy
#   · gzip 覆盖 JSON / JS / CSS / SVG（原来只压 HTML）
#   · /api 与 /login 限流（原来完全没有）
#   · AI 接口超时从默认 60s 放宽到 180s
#   · client_max_body_size 12M（比后端 10MB 上限留余量）
#   · /uploads 加 CSP sandbox + nosniff（挡住 SVG 同源 XSS）
#   · 屏蔽 /api/v1/openapi.json
#   · 标准 443 单端口（如需非标端口可加 --port 8443，但未备案域名照样会被 SNI 拦截）
#
# 安全机制：备份 → 写入 → nginx -t 校验 → 通过才 reload；失败自动回滚。
#
# 用法：
#   sudo bash ~/harden-nginx.sh                    # 只用 IP（server_name _ + 自签证书）
#   sudo bash ~/harden-nginx.sh weiyun.xin         # 绑定域名（需已有有效证书）
#   sudo bash ~/harden-nginx.sh weiyun.xin --hsts  # 同时下发 HSTS
#   sudo bash ~/harden-nginx.sh weiyun.xin --dry-run
#
# 注意：大陆服务器上，未备案域名会在 TLS 层按 SNI 被接入商拦截，
# 与端口无关（8443 也一样），必须完成 ICP 备案后才能用域名访问。
#
set -euo pipefail

CONF=/etc/nginx/sites-available/blog
BACKUP_DIR=/etc/nginx/backup
DOMAIN=""
HTTPS_PORT=443
DRY_RUN=0
HSTS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --hsts) HSTS=1; shift ;;
    --port) HTTPS_PORT="${2:?--port 需要参数}"; shift 2 ;;
    --port=*) HTTPS_PORT="${1#*=}"; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    -*) echo "未知参数: $1" >&2; exit 2 ;;
    *) DOMAIN="$1"; shift ;;
  esac
done

if ! [[ "$HTTPS_PORT" =~ ^[0-9]+$ ]] || [ "$HTTPS_PORT" -lt 1 ] || [ "$HTTPS_PORT" -gt 65535 ]; then
  echo "端口非法: $HTTPS_PORT" >&2
  exit 2
fi

# dry-run 也要求 root：/etc/letsencrypt/live 是 700，非 root 检测不到证书，
# 会误判成"没有正式证书"从而回退到自签，输出和真实执行不一致。
# CCWY_ALLOW_NONROOT=1 仅供 CI/本地渲染测试，生产请勿设置
if [ "$(id -u)" -ne 0 ] && [ "${CCWY_ALLOW_NONROOT:-0}" != "1" ]; then
  echo "请用 sudo 运行（dry-run 也一样，否则读不到 /etc/letsencrypt）：" >&2
  echo "  sudo bash $0 ${DOMAIN} --port ${HTTPS_PORT} $([ "$DRY_RUN" -eq 1 ] && echo --dry-run)" >&2
  exit 1
fi

# ── 1. 探测证书 ────────────────────────────────────────────────
HAVE_REAL_CERT=0
CERT=""
KEY=""

# 仅测试用：用指定证书代替 /etc/letsencrypt 探测（CI/本地渲染）
if [ -n "${SSL_CERT_OVERRIDE:-}" ] && [ -f "${SSL_CERT_OVERRIDE}" ] && [ -n "${SSL_KEY_OVERRIDE:-}" ]; then
  CERT="$SSL_CERT_OVERRIDE"
  KEY="$SSL_KEY_OVERRIDE"
  HAVE_REAL_CERT=1
fi

LE_CERT=""
LE_KEY=""
if [ -n "$DOMAIN" ]; then
  LE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  LE_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
fi

# 只认「存在且至少还有 7 天有效」的证书，避免把过期证书配到线上
if [ "$HAVE_REAL_CERT" -eq 0 ] && [ -n "$LE_CERT" ] && [ -f "$LE_CERT" ]; then
  if openssl x509 -checkend 604800 -noout -in "$LE_CERT" 2>/dev/null; then
    CERT="$LE_CERT"
    KEY="$LE_KEY"
    HAVE_REAL_CERT=1
  else
    EXPIRED_AT="$(openssl x509 -enddate -noout -in "$LE_CERT" 2>/dev/null | cut -d= -f2)"
    echo "⚠️  $DOMAIN 的证书已过期或 7 天内到期（到期时间：${EXPIRED_AT:-未知}），本次改用自签证书。"
    echo "    请先续期：sudo certbot certonly --manual --preferred-challenges dns -d $DOMAIN"
    echo
  fi
fi

# 没有可用正式证书 → 回退自签（存在就行）
if [ "$HAVE_REAL_CERT" -eq 0 ]; then
  if [ -f /etc/nginx/ssl/selfsigned.crt ] && [ -f /etc/nginx/ssl/selfsigned.key ]; then
    CERT=/etc/nginx/ssl/selfsigned.crt
    KEY=/etc/nginx/ssl/selfsigned.key
  else
    echo "找不到可用证书（/etc/letsencrypt 或 /etc/nginx/ssl）" >&2
    exit 1
  fi
fi

SERVER_NAME="${DOMAIN:-_}"

# ── 2. nginx 版本决定 http2 写法 ──────────────────────────────
NGINX_VER="$(nginx -v 2>&1 | sed -E 's#.*nginx/([0-9]+\.[0-9]+).*#\1#' || true)"
# 取不到版本（例如本地渲染测试环境没装 nginx）时按新版处理
if ! [[ "$NGINX_VER" =~ ^[0-9]+\.[0-9]+$ ]]; then
  NGINX_VER="1.28"
fi
V_MAJOR="${NGINX_VER%%.*}"
V_MINOR="${NGINX_VER#*.}"
if [ "$V_MAJOR" -gt 1 ] || { [ "$V_MAJOR" -eq 1 ] && [ "$V_MINOR" -ge 25 ]; }; then
  HTTP2_LINE="    http2 on;"
else
  HTTP2_LINE=""
  LISTEN_SUFFIX=" http2"
fi
LISTEN_SUFFIX="${LISTEN_SUFFIX:-}"

# 监听 443（兼容直接用 IP 访问）+ 自定义端口（未备案域名走这里）
LISTEN_LINES="    listen 443 ssl${LISTEN_SUFFIX};"
if [ "$HTTPS_PORT" != "443" ]; then
  LISTEN_LINES="${LISTEN_LINES}
    listen ${HTTPS_PORT} ssl${LISTEN_SUFFIX};"
fi

# 80 → HTTPS 跳转目标（非 443 时要带端口号）
if [ "$HTTPS_PORT" = "443" ]; then
  REDIRECT_TO="https://\$host\$request_uri"
else
  REDIRECT_TO="https://\$host:${HTTPS_PORT}\$request_uri"
fi

# HSTS 必须显式 --hsts 才启用，理由：
#   1) 自签证书 + HSTS = 浏览器永久拒绝绕过警告，极难恢复
#   2) 证书一旦续期失败过期，已访问过的用户会直接打不开（连"继续"都没有）
#   3) 不带 includeSubDomains —— 避免把其它子域也强制到 HTTPS
if [ "$HSTS" -eq 1 ] && [ "$HAVE_REAL_CERT" -eq 1 ]; then
  HSTS_LINE='add_header Strict-Transport-Security "max-age=31536000" always;'
else
  if [ "$HSTS" -eq 1 ] && [ "$HAVE_REAL_CERT" -eq 0 ]; then
    echo "⚠️  没有正式证书，--hsts 被忽略（自签 + HSTS 会让浏览器永久拒绝绕过警告）" >&2
  fi
  HSTS_LINE='# 未启用 HSTS（确认证书续期可靠后再加 --hsts）'
fi

# 公共安全头：任何 location 里只要出现 add_header 就会取消 server 级继承，
# 所以每个需要安全头的 location 都显式重复这一组
COMMON_HEADERS="    add_header X-Content-Type-Options \"nosniff\" always;
    add_header X-Frame-Options \"SAMEORIGIN\" always;
    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;"

# location 级：缩进不同，且必须重复（add_header 会取消 server 级继承）
LOC_HEADERS="        add_header X-Content-Type-Options \"nosniff\" always;
        add_header X-Frame-Options \"SAMEORIGIN\" always;
        add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;"

PROXY_HEADERS="        proxy_set_header Host \$ccwy_host;
        proxy_set_header X-Forwarded-Host \$ccwy_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;"

# ── 3. 生成配置 ───────────────────────────────────────────────
TMP_CONF="$(mktemp)"
trap 'rm -f "$TMP_CONF"' EXIT

cat > "$TMP_CONF" <<EOF
# 由 scripts/harden-nginx.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
# HTTPS 端口：${HTTPS_PORT}

# ── 透传 Host（含端口）──────────────────────────────────────
# 关键：nginx 的 host 变量不带端口。若将来跑在非 443 端口上，
# 后端生成的绝对链接（RSS 里的文章地址）会丢掉端口导致打不开。
map \$http_host \$ccwy_host {
    default \$http_host;   # 保留 "域名:端口"
    ""      \$host;        # 极端情况（HTTP/1.0 无 Host）退回
}

# ── 限流区（http 上下文，sites-enabled 被 include 在 http 块内）──
limit_req_zone \$binary_remote_addr zone=ccwy_api:10m    rate=15r/s;
limit_req_zone \$binary_remote_addr zone=ccwy_login:10m  rate=5r/m;
limit_req_status 429;

server {
    listen 80;
    server_name ${SERVER_NAME};
    return 301 ${REDIRECT_TO};
}

server {
${LISTEN_LINES}
${HTTP2_LINE}
    server_name ${SERVER_NAME};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    ${HSTS_LINE}
${COMMON_HEADERS}

    # 上传：12M（后端业务上限 10MB，multipart 有额外开销）
    client_max_body_size 12M;

    # AI 推荐要调大模型，默认 60s 会 504
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
    proxy_connect_timeout 10s;

    # gzip：原来只压 text/html，JSON/JS/CSS 全裸奔
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_types
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        text/css
        text/plain
        text/xml;

    # 生产环境不暴露接口文档
    location = /api/v1/openapi.json {
        return 404;
    }

    # 登录：限 5 次/分钟，防爆破
    location = /api/v1/login/access-token {
        limit_req zone=ccwy_login burst=5 nodelay;
        limit_req_status 429;
${PROXY_HEADERS}
        proxy_pass http://127.0.0.1:8000;
    }

    location /api/ {
        limit_req zone=ccwy_api burst=40 nodelay;
${LOC_HEADERS}
${PROXY_HEADERS}
        proxy_pass http://127.0.0.1:8000;
    }

    location /uploads/ {
${LOC_HEADERS}
        # 关键：即使有人上传了带 <script> 的 SVG，也在沙箱里执行，
        # 拿不到主站的 localStorage（JWT 就存在那里）
        add_header Content-Security-Policy "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" always;
        # 文件名是 uuid，内容不变 → 可以长缓存
        add_header Cache-Control "public, max-age=2592000, immutable" always;
${PROXY_HEADERS}
        proxy_pass http://127.0.0.1:8000;
    }

    # ── 个人项目（静态子应用）────────────────────────────────
    # 每个项目一个目录：/srv/www/<name>/，独立构建、rsync 部署，不经过 Next
    location /resume/ {
        alias /srv/www/resume/;
        index index.html;
    }

    location / {
${LOC_HEADERS}
${PROXY_HEADERS}
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

echo "── 生成的配置 ──────────────────────────────"
cat "$TMP_CONF"
echo "────────────────────────────────────────────"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run：未写入任何文件。"
  exit 0
fi

# ── 4. 备份 → 写入 → 校验 → reload（失败自动回滚）────────────
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BACKUP_DIR/blog.$STAMP"
echo "已备份到 $BACKUP_DIR/blog.$STAMP"

install -m 644 "$TMP_CONF" "$CONF"

if ! nginx -t 2>/tmp/nginx-test.err; then
  echo "❌ nginx -t 校验失败，正在回滚…" >&2
  cat /tmp/nginx-test.err >&2
  cp -a "$BACKUP_DIR/blog.$STAMP" "$CONF"
  nginx -t >/dev/null 2>&1 || echo "⚠️  回滚后校验仍失败，请手工检查 $CONF" >&2
  echo "已恢复到修改前的配置，线上未受影响。"
  exit 1
fi
echo "✅ nginx -t 校验通过"

if systemctl -q is-active nginx 2>/dev/null; then
  systemctl reload nginx
else
  nginx -s reload
fi
echo "✅ 已 reload nginx"

# ── 5. 自检 ──────────────────────────────────────────────────
echo
echo "── 自检 ────────────────────────────────────"
CHECK_HOST="${DOMAIN:-127.0.0.1}"
for path in / /api/v1/site-settings /api/v1/feed; do
  code=$(curl -ks -o /dev/null -w '%{http_code}' -H "Host: $CHECK_HOST" \
    "https://127.0.0.1:${HTTPS_PORT}${path}" || echo "000")
  printf "  %-24s :%s  %s\n" "$path" "$HTTPS_PORT" "$code"
done
printf "  %-24s :%s  " "/api/v1/openapi.json" "$HTTPS_PORT"
curl -ks -o /dev/null -w '%{http_code}（应为 404）\n' -H "Host: $CHECK_HOST" \
  "https://127.0.0.1:${HTTPS_PORT}/api/v1/openapi.json"

echo
echo "  响应头检查："
curl -ksI -H "Host: $CHECK_HOST" "https://127.0.0.1:${HTTPS_PORT}/" \
  | grep -iE 'strict-transport|x-content-type|x-frame|referrer-policy' \
  | sed 's/^/    /' || echo "    (未取到安全头，请检查)"

echo
echo "完成。回滚：sudo cp $BACKUP_DIR/blog.$STAMP $CONF && sudo systemctl reload nginx"

# ── 6. 后续提示 ──────────────────────────────────────────────
if [ "$HAVE_REAL_CERT" -eq 0 ]; then
  echo
  echo "⚠️  当前仍是自签证书：浏览器会报警、RSS 阅读器会拒绝连接。"
  echo
  echo "如果域名已备案，直接用 HTTP-01（最省事，且能自动续期）："
  echo
  echo "    sudo certbot certonly --nginx -d ${DOMAIN:-你的域名}"
  echo "    sudo bash ~/harden-nginx.sh ${DOMAIN:-你的域名}   # 再跑一次切换证书"
  echo
  echo "如果域名还没备案（80 端口会被接入商拦截），只能用 DNS-01："
  echo
  echo "    sudo certbot certonly --manual --preferred-challenges dns -d ${DOMAIN:-你的域名}"
  echo
  echo "  按提示在 DNS 控制台添加 TXT 记录："
  echo "    _acme-challenge.${DOMAIN:-你的域名}  →  一段随机字符串"
  echo "  验证通过后证书落在 /etc/letsencrypt/live/${DOMAIN:-你的域名}/"
  echo "  然后重跑本脚本，会自动检测并切换："
  echo
  echo "    sudo bash ~/harden-nginx.sh ${DOMAIN:-你的域名} --port ${HTTPS_PORT}"
  echo
  echo "  注意：manual 模式签的是 90 天证书，到期要手动续。"
  echo "  想自动续期，可改用 acme.sh + 阿里云 DNS API（需要 AccessKey）。"
fi

if [ "$HTTPS_PORT" != "443" ]; then
  echo
  echo "📌 非标准端口 ${HTTPS_PORT}，记得在安全组放行。"
  echo "   访问地址：https://${DOMAIN:-你的域名}:${HTTPS_PORT}"
fi

if [ "$HSTS" -eq 0 ]; then
  echo
  echo "ℹ️  HSTS 未启用。确认下面两件事之后再执行 --hsts："
  echo "   1) sudo certbot renew --dry-run   （验证 80 端口能否通过 HTTP-01）"
  echo "   2) 证书到期时间还早，且续期路径可靠"
fi
