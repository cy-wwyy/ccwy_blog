# 前端部署（GitHub Actions → standalone 产物）

## 为什么这么做

开发机是 **ARM64**，服务器是 **x86_64**。直接本地 `npm run build` 再传上去，`sharp`
这类原生模块的 `.node` 二进制架构不匹配，`next start` 会直接报错。

所以构建放在 GitHub 的 **x86_64 runner** 上，产出 Next 的 `standalone` 包
（自带精简 node_modules，42MB 左右），服务器只做「解包 + 切软链 + 重启」。

```
push → GitHub Actions(x86) → npm ci → build → standalone 打包
                                │
                                ├─ 推到 dist 分支（12MB）
                                ▼
                          服务器 git fetch（下载方向，~259KB/s）
                                │
                         服务器 ~/apps/ccwy-web/
                           ├── current -> releases/20261126-2210-abc1234
                           ├── previous -> releases/...
                           └── releases/
                                 └── 20261126-2210-abc1234/
                                     ├── server.js
                                     ├── .next/
                                     ├── public/
                                     ├── node_modules/   (只 10 个包)
                                     └── BUILD_INFO
                                │
                                └─ systemd blog-frontend.service → node server.js (127.0.0.1:3000)
                                       ▲
                                   nginx:443
```

## 一次性初始化

### 1. 生成部署密钥

在本机执行（**不要带密码短语**，CI 无法交互输入）：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ccwy_deploy -N ""
cat ~/.ssh/ccwy_deploy.pub        # 公钥，下一步用
cat ~/.ssh/ccwy_deploy            # 私钥，填进 GitHub Secrets
```

把**公钥**追加到服务器的 `~/.ssh/authorized_keys`：

```bash
ssh -i ~/.ssh/ccwy_prod.pem ecs-user@120.79.123.93 \
  'echo "这里粘贴公钥" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

> 图省事也可以直接复用现有的 `ccwy_prod.pem` 作为 `SSH_PRIVATE_KEY`（它的公钥
> 已经在服务器上了）。但那样等于把个人密钥交给 CI，不推荐长期这么做。

### 2. 配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 值 |
|---|---|
| `SSH_HOST` | `120.79.123.93` |
| `SSH_USER` | `ecs-user` |
| `SSH_PORT` | `22`（可不填） |
| `SSH_PRIVATE_KEY` | 上一步的私钥全文，含 `-----BEGIN/END-----` 两行 |
| `NEXT_PUBLIC_AMAP_KEY` | 高德 Key（`NEXT_PUBLIC_*` 构建时内联，必须在这配） |
| `NEXT_PUBLIC_AMAP_SECRET` | 高德安全密钥 |

### 3. 服务器初始化（一次，需要 sudo）

```bash
scp -i ~/.ssh/ccwy_prod.pem deploy/bootstrap-server.sh ecs-user@120.79.123.93:~/
ssh -i ~/.ssh/ccwy_prod.pem ecs-user@120.79.123.93 \
  'sudo bash ~/bootstrap-server.sh'
```

它会建目录、安装新的 `blog-frontend.service`、`daemon-reload`。
**故意不重启**——旧版本继续跑，等第一次 Actions 部署到位再切换。

### 4. 触发部署

推到 `main`（工作流监听 `main` 上的 `frontend/**` 变更），或去 Actions 页面
手动 **Run workflow**。

> 你现在的改动在 `feat/admin-nova` 分支上。要么先合并到 `main`，要么临时在
> workflow 的 `branches:` 里加上这个分支名。

## 日常发布

```bash
git push origin main        # 改了 frontend/ 下任何文件就会触发
```

Actions 里能看到实时的构建日志；失败时服务器上是**旧版本继续服务**（部署脚本
在切链前不动 current）。

## 回滚

服务器上一条命令：

```bash
bash ~/apps/ccwy-web/deploy-remote.sh --rollback
bash ~/apps/ccwy-web/deploy-remote.sh --list     # 看有哪些版本
```

## 线上排查

```bash
readlink -f ~/apps/ccwy-web/current      # 当前跑的是哪个 release
cat ~/apps/ccwy-web/current/BUILD_INFO    # commit / 构建时间 / node 版本
systemctl status blog-frontend --no-pager
tail -f ~/logs/ccwy-web.log               # 单元里配了日志重定向
```

## 几个必须知道的点

| 点 | 说明 |
|---|---|
| **`NEXT_PUBLIC_*` 构建时固化** | 改 AMAP Key 必须重新构建并重新部署，改服务器环境变量无效 |
| **不能在 ARM 机器上构建** | 产物含 `sharp` 等原生模块，架构必须与服务器一致 |
| **服务器不再需要 `npm ci`** | standalone 自带依赖（10 个包），首次部署后可删 `~/code/ccwy_blog/frontend/node_modules` |
| **重启方式** | 部署脚本 kill 进程，靠 systemd `Restart=always` 拉起；不需要 sudo |
| **保留 5 个版本** | 自动清理更旧的 release，避免磁盘堆积 |
| **健康检查** | 每次发布后 curl `127.0.0.1:3000`，30 秒内不通自动回滚 |

## 常见坑

**密钥加到了 Variables 而不是 Secrets**

`Settings → Secrets and variables → Actions` 页面顶部有两个标签：`Secrets` 和
`Variables`。两者的区别：

| | Secrets | Variables |
|---|---|---|
| 值是否可见 | 永不回显 | 明文显示 |
| 引用方式 | `${{ secrets.X }}` | `${{ vars.X }}` |
| 日志 | 自动打码 `***` | 明文输出 |

加到 Variables 之后 `secrets.X` 解析为空，表现为 Build 步骤 0 秒失败（被空值
校验拦下）。私钥务必放 Secrets。

**密钥加到了 Environment 而不是仓库级**

环境级（`Settings → Environments → <名字> → Secrets`）只有在 job 里声明
`environment: <名字>` 时可见。本工作流已声明。

**空提交不会触发部署**

工作流有 `paths` 过滤，只监听 `frontend/**`、`deploy/**` 和工作流文件本身。
空提交不改文件，不会触发；需要手动 `workflow_dispatch` 或改上述路径下的文件。

## 必需的 Secrets 清单（自查）

| 名称 | 必填 | 值 |
|---|---|---|
| `SSH_HOST` | ✅ | `120.79.123.93` |
| `SSH_USER` | ✅ | `ecs-user` |
| `SSH_PRIVATE_KEY` | ✅ | 私钥全文，含 BEGIN/END |
| `NEXT_PUBLIC_AMAP_KEY` | ✅ | 高德 Key |
| `NEXT_PUBLIC_AMAP_SECRET` | ✅ | 高德安全密钥 |
| `SSH_PORT` | 可选 | 默认 22 |

缺任何一个都会在对应步骤失败，且步骤名会直接指出缺哪一类：

| 失败步骤 | 含义 |
|---|---|
| `Check SSH secrets present` | `SSH_HOST` / `SSH_USER` / `SSH_PRIVATE_KEY` 有空值 |
| `Validate SSH key format` | 私钥缺 BEGIN/END 或被截断 |
| `Write SSH key and probe host` | 私钥无法解析 |
| `Probe SSH login` | 私钥与服务器 `authorized_keys` 不匹配 |
| `Build` | AMAP 两个 key 为空 |

## 为什么是 dist 分支而不是直接 scp

最初用 `scp` 从 runner 直接把 12MB 产物推到服务器，实测只有 **~17KB/s**，
一次部署要 12–15 分钟，经常顶到 job 超时。

改成「runner 推到 GitHub 的 dist 分支 → 服务器 git fetch」之后：

| 方向 | 实测速度 |
|---|---|
| runner → 服务器（跨境上传） | ~17 KB/s |
| 服务器 → GitHub（跨境下载） | ~259 KB/s |

差一个数量级。现在每次部署的传输约 50 秒。

`dist` 分支每次是一个**孤立提交**并强制覆盖，所以历史不会无限增长；
服务器侧每次 `rm -rf` 后重新 `git init` + `fetch --depth 1`，避免浅克隆的状态问题。
