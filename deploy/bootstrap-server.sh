#!/usr/bin/env bash
#
# 服务器一次性初始化（需要 sudo，只跑一次）
#
#   sudo bash deploy/bootstrap-server.sh
#
# 做三件事：
#   1. 创建 ~/apps/ccwy-web/{releases,incoming} 与 ~/logs
#   2. 安装新的 systemd 单元（standalone 版）
#   3. daemon-reload（不重启，避免旧版本被立即打断；
#      第一次 Actions 部署到位时会自动切过去）
#
set -euo pipefail

APP_USER="${SUDO_USER:-ecs-user}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_DIR="$APP_HOME/apps/ccwy-web"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 sudo 运行：sudo bash deploy/bootstrap-server.sh" >&2
  exit 1
fi

echo "── 1. 创建目录 ──────────────────────────────"
install -d -o "$APP_USER" -g "$APP_USER" \
  "$APP_DIR" "$APP_DIR/releases" "$APP_DIR/incoming" "$APP_HOME/logs"
ls -ld "$APP_DIR"/* "$APP_HOME/logs"

echo
echo "── 2. 安装 systemd 单元 ─────────────────────"
if [ -f /etc/systemd/system/blog-frontend.service ]; then
  cp /etc/systemd/system/blog-frontend.service \
     "/etc/systemd/system/blog-frontend.service.bak-$(date +%Y%m%d-%H%M%S)"
  echo "旧单元已备份"
fi

# 单元里的路径按实际用户生成
sed -e "s#/home/ecs-user#$APP_HOME#g" \
    "$(dirname "$0")/blog-frontend.service" \
    > /etc/systemd/system/blog-frontend.service
chmod 644 /etc/systemd/system/blog-frontend.service

echo
echo "── 3. daemon-reload ─────────────────────────"
systemctl daemon-reload
systemctl status blog-frontend --no-pager -l | head -6 || true

cat <<EOF

✅ 初始化完成。

下一步在 GitHub 仓库里配置 Secrets（Settings → Secrets and variables → Actions）：

  SSH_HOST              服务器 IP 或域名
  SSH_USER              ecs-user
  SSH_PORT              22（可选，默认 22）
  SSH_PRIVATE_KEY       部署专用私钥全文（含 BEGIN/END 行）
  NEXT_PUBLIC_AMAP_KEY     高德地图 Key
  NEXT_PUBLIC_AMAP_SECRET  高德地图安全密钥

然后把代码推到 main 分支，或在 Actions 页面手动 Run workflow。

验证线上是否切换成功：

  readlink -f $APP_DIR/current
  cat $APP_DIR/current/BUILD_INFO
  curl -I http://127.0.0.1:3000/

旧目录 ~/code/ccwy_blog/frontend/node_modules 确认新版跑通后可以删掉，能省几百 MB。
EOF
