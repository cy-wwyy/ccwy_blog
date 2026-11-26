#!/usr/bin/env bash
#
# 服务器端发布脚本 —— 由 GitHub Actions 通过 ssh 调用，不要手动改参数。
#
#   bash deploy-remote.sh <commit-sha>   发布 incoming/<sha>.tar.gz
#   bash deploy-remote.sh --rollback     回滚到上一个 release
#   bash deploy-remote.sh --list         查看现有 release
#
# 设计要点
#   · releases/<时间戳>-<sha>/ 每个版本一个目录，current 用软链接原子切换
#   · 不需要 sudo：进程属于 ecs-user，kill 之后 systemd（Restart=always）会自动拉起
#     —— WorkingDirectory 指向 current，重启即生效
#   · 健康检查失败自动回滚，避免把线上改成打不开的状态
#
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/ccwy-web}"
RELEASES="$APP_DIR/releases"
CURRENT="$APP_DIR/current"
PREVIOUS="$APP_DIR/previous"
KEEP=5
HEALTH_URL="http://127.0.0.1:3000/"

log()  { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ❌ %s\n' "$*" >&2; exit 1; }

port_pid() {
  # 找到监听 3000 的 node 进程（属于当前用户）
  ss -ltnp 2>/dev/null | grep -F ':3000 ' | grep -oP 'pid=\K[0-9]+' | head -1
}

health_check() {
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 3 "$HEALTH_URL"; then
      log "健康检查通过（第 ${i} 次尝试）"
      return 0
    fi
    sleep 1
  done
  return 1
}

restart_service() {
  local pid
  pid="$(port_pid || true)"
  if [ -n "$pid" ]; then
    log "结束进程 $pid，等待 systemd 以新代码重启…"
    kill "$pid" 2>/dev/null || true
  else
    log "没有发现监听 3000 的进程，尝试通过 systemd 拉起"
    if ! systemctl restart blog-frontend 2>/dev/null; then
      fail "无法启动服务，请手动执行：sudo systemctl restart blog-frontend"
    fi
    return 0
  fi
  # systemd Restart=always + RestartSec=3，等它自己起来
  sleep 5
}

switch_to() {
  local target="$1"
  [ -d "$target" ] || fail "目录不存在：$target"
  # 原子切换：先建临时链接再 mv -T 覆盖
  ln -sfn "$target" "$APP_DIR/.current.tmp"
  mv -Tf "$APP_DIR/.current.tmp" "$CURRENT"
  log "current → $(basename "$target")"
}

case "${1:-}" in
  --list)
    ls -1dt "$RELEASES"/*/ 2>/dev/null | sed "s#$RELEASES/##;s#/\$##" || echo "（暂无 release）"
    exit 0
    ;;
  --rollback)
    [ -L "$PREVIOUS" ] || fail "没有可回滚的版本"
    target="$(readlink -f "$PREVIOUS")"
    [ -d "$target" ] || fail "previous 指向的目录已不存在：$target"
    log "回滚到 $(basename "$target")"
    switch_to "$target"
    restart_service
    health_check || fail "回滚后健康检查仍然失败，请人工介入"
    log "✅ 已回滚"
    exit 0
    ;;
  "")
    fail "用法：$0 <commit-sha> | --rollback | --list"
    ;;
esac

SHA="$1"
TARBALL="$APP_DIR/incoming/$SHA.tar.gz"
REPO="$APP_DIR/repo"
GIT_REMOTE="${GIT_REMOTE:-git@github.com:cy-wwyy/ccwy_blog.git}"

# 从 dist 分支拉产物。
# 方向很重要：境内机器「下载」GitHub 实测 ~259KB/s，
# 而 GitHub runner「上传」到境内只有 ~17KB/s，差一个数量级。
log "从 dist 分支拉取产物…"
rm -rf "$REPO"
mkdir -p "$REPO" "$APP_DIR/incoming"
git -C "$REPO" init -q
git -C "$REPO" remote add origin "$GIT_REMOTE"
git -C "$REPO" fetch -q --depth 1 origin dist || fail "拉取 dist 分支失败（检查服务器到 GitHub 的 SSH 通路）"
git -C "$REPO" show FETCH_HEAD:ccwy-web.tar.gz > "$TARBALL" 2>/dev/null \
  || fail "dist 分支里没有 ccwy-web.tar.gz"
log "产物大小：$(du -h "$TARBALL" | cut -f1)"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$RELEASES/${STAMP}-${SHA:0:7}"

log "解包到 $(basename "$TARGET")"
mkdir -p "$TARGET"
tar -xzf "$TARBALL" -C "$TARGET"

[ -f "$TARGET/server.js" ] || fail "产物里没有 server.js，构建步骤可能没生成 standalone"

# 记录构建信息（dist 分支里带的 COMMIT_INFO）
git -C "$REPO" show FETCH_HEAD:COMMIT_INFO > "$TARGET/BUILD_INFO" 2>/dev/null \
  || echo "sha=$SHA" > "$TARGET/BUILD_INFO"

# 记录上一个版本，供回滚
if [ -L "$CURRENT" ]; then
  ln -sfn "$(readlink -f "$CURRENT")" "$PREVIOUS"
fi

switch_to "$TARGET"
restart_service

if ! health_check; then
  log "❌ 新版本健康检查失败，准备回滚"
  if [ -L "$PREVIOUS" ]; then
    prev="$(readlink -f "$PREVIOUS")"
    switch_to "$prev"
    restart_service
    health_check && log "已回滚到 $(basename "$prev")" || log "⚠️ 回滚后仍不健康，请人工检查"
  else
    log "⚠️ 没有上一版本可回滚"
  fi
  exit 1
fi

# 清理旧版本，只留最近 KEEP 个
log "清理旧 release（保留 $KEEP 个）"
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$(readlink -f "$old")" = "$(readlink -f "$CURRENT")" ] && continue
  [ -L "$PREVIOUS" ] && [ "$(readlink -f "$old")" = "$(readlink -f "$PREVIOUS")" ] && continue
  rm -rf "$old"
done

rm -f "$TARBALL"

log "✅ 发布完成：$(basename "$TARGET")"
log "   回滚命令：bash ~/$APP_DIR/deploy-remote.sh --rollback"
