#!/usr/bin/env bash
#
# 后端发布脚本 —— 由 GitHub Actions 通过 ssh 调用（也可手动跑）
#
#   bash deploy-backend.sh
#
# 做的事：git 对齐 origin/main → 备份数据库 → alembic 迁移 → 重启 uvicorn
#         → 健康检查（失败自动回滚代码）
#
# 不需要 sudo：uvicorn 进程属于 ecs-user，kill 之后 systemd（Restart=always）
# 会自动用新代码拉起。
#
set -euo pipefail

REPO="${REPO:-$HOME/code/ccwy_blog}"
BRANCH="${BRANCH:-main}"
HEALTH="${HEALTH:-http://127.0.0.1:8000/api/v1/site-settings}"
KEEP_BACKUPS=5

log()  { printf '[backend] %s\n' "$*"; }
fail() { printf '[backend] ❌ %s\n' "$*" >&2; exit 1; }

[ -d "$REPO/.git" ] || fail "找不到仓库：$REPO"

backend_pid() {
  ss -ltnp 2>/dev/null | grep -F ':8000 ' | grep -oP 'pid=\K[0-9]+' | head -1
}

health_check() {
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 3 "$HEALTH"; then
      log "健康检查通过（第 ${i} 次）"
      return 0
    fi
    sleep 1
  done
  return 1
}

restart_backend() {
  local pid
  pid="$(backend_pid || true)"
  if [ -n "$pid" ]; then
    log "结束 uvicorn $pid，等待 systemd 拉起…"
    kill "$pid" 2>/dev/null || true
    sleep 5
  else
    log "未发现 8000 端口进程，尝试 systemctl restart"
    systemctl restart blog-backend 2>/dev/null \
      || fail "无法启动后端，请手动执行：sudo systemctl restart blog-backend"
  fi
}

cd "$REPO"
PREV="$(git rev-parse HEAD)"
log "当前 HEAD：${PREV:0:7}"

git fetch -q origin "$BRANCH" || fail "git fetch 失败"
TARGET="$(git rev-parse "origin/$BRANCH")"

if [ "$PREV" = "$TARGET" ]; then
  log "代码已是最新（${TARGET:0:7}），只重启并做健康检查"
else
  # 只对齐受版本控制的文件；.env / .venv / uploads / *.db 都是 ignored，不受影响
  git reset -q --hard "$TARGET"
  log "代码更新到 ${TARGET:0:7}（${PREV:0:7} → ${TARGET:0:7}）"
fi

cd "$REPO/backend"

if [ -f ccwy_blog.db ]; then
  BAK="ccwy_blog.db.bak-$(date +%Y%m%d-%H%M%S)"
  cp -f ccwy_blog.db "$BAK" && log "数据库已备份：$BAK"
fi

log "应用数据库迁移…"
if ! .venv/bin/alembic upgrade head; then
  log "❌ 迁移失败。数据库备份在上面，代码未重启，线上仍是旧版本"
  cd "$REPO" && git reset -q --hard "$PREV"
  fail "alembic upgrade head 失败，已把代码回退到 ${PREV:0:7}"
fi

restart_backend

if ! health_check; then
  log "❌ 健康检查失败，回滚代码到 ${PREV:0:7}"
  cd "$REPO" && git reset -q --hard "$PREV"
  restart_backend
  if health_check; then
    log "已回滚，服务恢复"
  else
    log "⚠️ 回滚后仍不健康，请人工检查：systemctl status blog-backend -l"
  fi
  fail "部署失败（注意：数据库迁移不会自动回滚）"
fi

# 清理旧备份，只留最近 KEEP_BACKUPS 个
if ls -1 "$REPO"/backend/ccwy_blog.db.bak-* >/dev/null 2>&1; then
  ls -1t "$REPO"/backend/ccwy_blog.db.bak-* | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
  log "旧备份已清理（保留 $KEEP_BACKUPS 个）"
fi

log "✅ 后端部署完成：${TARGET:0:7}"
