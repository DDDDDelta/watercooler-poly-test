# 💧 Watercooler · 茶水间预测市场

一个给同事们自己玩的 Polymarket 风格预测市场。用虚拟货币「水滴」押注团建去哪、周会多久、指数收在几点……所有下注汇成奖池，猜对的人按比例瓜分。

> 水滴没有任何现实价值，仅供娱乐。

## 功能

- **账号**：用户名 + 密码注册登录，可选邀请码；会话用 httpOnly Cookie，密码 scrypt 加盐哈希
- **市场**：是/否二元市场和多选一市场（2–10 个互斥选项），任何人都能发起
- **下注**：奖池模式，随时下注，前端实时显示奖池占比、预计赔率和猜中可得
- **结算**：发起人公布结果，押中的人按比例瓜分全部奖池；发起人也可以取消市场全额退款，截止 7 天后还没公布会自动取消退款
- **社交**：评论区、下注榜、下注记录、全站下注滚动条、个人主页
- **排行榜**：按盈利 / 总资产 / 下注次数排名
- **经济系统**：注册送 1000 水滴，每日签到 +100，系统不做庄、不补贴
- **AI 专区**：可选的 AI 机器人（默认每个站 50 个）用大模型联网找新闻出题、互相下注、自己核实公布结果；机器人只在 AI 专区玩，人可以去押注、赢机器人的水滴。配置见 [`bot.example.json`](bot.example.json) 和 [`deploy/README.md`](deploy/README.md)
- **企业微信机器人**：可选，在 `bot.json` 里配上企业微信智能机器人后，大家在群里 @机器人 领一个专属链接、在网站上确认绑定，之后就能在群里聊天查盘、下注、开盘、公布结果（涉及水滴的操作都要点确认卡片），结算结果和「该公布结果了」的提醒也会发到群里
- **没有管理员**：忘记密码由站长在服务器上用命令重置（见 [`deploy/README.md`](deploy/README.md)）
- **移动端适配**：底部导航栏，下注面板自动排在图表下方
- **日间 / 黑夜模式**：一键切换，界面风格参照非凸科技官网

## 技术栈

pnpm monorepo，前后端全部 TypeScript：

```
apps/
  server/     Node.js + Hono + better-sqlite3（SQLite）
  web/        React 19 + Vite + Tailwind CSS v4 + TanStack Query + Recharts
packages/
  shared/     前后端共用：奖池分配算法、API 类型、zod 校验规则
```

没有用 Next.js：这个项目就是一个 SPA + 一个 JSON API，分开更简单直接，部署时也只是一个 Node 进程（API 和前端静态文件由同一个服务提供）。前端的赔率预估和后端的派奖用的是 `packages/shared` 里同一份奖池代码，保证看到的和实际拿到的一致。

## 本地开发

需要 Node.js ≥ 20.19 和 pnpm（`corepack enable` 即可）。

```bash
pnpm install
pnpm seed        # 可选：生成演示用户和市场（xiaoming、lili…，密码都是 demo123）
pnpm dev         # 前端 http://localhost:5173 ，API http://localhost:3000
```

常用命令：

| 命令                | 作用                                     |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | 同时启动前后端（热更新）                 |
| `pnpm test`         | 运行测试（奖池算法 + API 集成测试）      |
| `pnpm typecheck`    | 全部包类型检查                           |
| `pnpm format`       | Prettier 格式化                          |
| `pnpm build`        | 构建前端和后端                           |
| `pnpm start`        | 用构建产物启动生产服务（默认 3000 端口） |
| `pnpm seed --reset` | 删除数据库并重新生成演示数据             |

## 部署

### GitHub Actions 自动部署

推送到 `main` 后自动构建、测试并通过 SSH 部署到服务器（后台脚本运行 + nginx 反向代理，支持部署在子路径下，失败自动回滚，不需要 systemd 和 sudo）。同一份代码部署成两个互相独立的实例：`/watercooler` 和 `/gang-bet`，各用各的数据库。服务器一次性准备、需要配置的 Secrets 和怎么再加实例见 [`deploy/README.md`](deploy/README.md)。

### 直接运行

```bash
pnpm install
pnpm build
cp .env.example .env   # 按需修改
pnpm start             # http://<服务器>:3000
```

数据都在 `data/watercooler.db`（SQLite）。

### Docker

```bash
docker build -t watercooler .
docker run -d --name watercooler -p 3000:3000 -v watercooler-data:/data \
  -e INVITE_CODE=change-me watercooler
```

数据库在容器内的 `/data/watercooler.db`，挂载卷即可持久化。

### 备份

SQLite 开了 WAL 模式，不要直接复制正在使用的 db 文件，用：

```bash
sqlite3 data/watercooler.db ".backup 'backup-$(date +%F).db'"
```

## 配置

通过环境变量或仓库根目录的 `.env` 文件配置，全部可选，详见 [`.env.example`](.env.example)：

| 变量               | 默认值                | 说明                                                                    |
| ------------------ | --------------------- | ----------------------------------------------------------------------- |
| `HOST`             | `0.0.0.0`             | 监听地址，放在 nginx 后面时设为 `127.0.0.1`                             |
| `PORT`             | `3000`                | 服务端口                                                                |
| `BASE_PATH`        | 无（站点根目录）      | 部署在子路径下时设置，如 `/watercooler`；**构建前端和运行服务时都要设** |
| `DATABASE_PATH`    | `data/watercooler.db` | SQLite 文件路径                                                         |
| `SITE_NAME`        | `Watercooler`         | 站点名称（logo、页脚、网页标题），**构建前端时设**                      |
| `SITE_COPY`        | `watercooler`         | 文案风格：`watercooler`（茶水间）或 `neutral`（中性），**构建前端时设** |
| `INVITE_CODE`      | 无                    | 设置后注册必须填写邀请码                                                |
| `STARTING_BALANCE` | `1000`                | 注册赠送水滴                                                            |
| `DAILY_BONUS`      | `100`                 | 每日签到奖励，`0` 关闭                                                  |
| `PRIVATE_MODE`     | `false`               | 开启后必须登录才能看到任何内容                                          |
| `APP_TIMEZONE`     | `Asia/Shanghai`       | 每日签到按哪个时区算「今天」                                            |

## 玩法说明

**奖池模式**：每个选项有一个奖池，你押多少水滴，就往那个选项的奖池里放多少。某个选项奖池占全部奖池的比例，就是大家眼中它发生的概率。

**派奖**：发起人公布结果后，押中的人按各自下注金额的比例瓜分**全部**奖池（包括押错的人的钱）。比如是/否两边分别押了 300 和 100，结果是「否」，押「否」的人就按比例分这 400，相当于赔率 ×4。没有人押中的话，所有下注全额退还。系统不抽成、也不补贴，水滴只在玩家之间流动。

**赔率会变**：下注时看到的赔率是按当时奖池算的，后面有人继续下注，赔率会变化，最终按截止时的奖池计算。下注之后不能撤回。

**发起人**：任何人都能发起市场，由发起人负责公布结果，发起人自己也可以下注。结果确定后可以提前公布（立即停止下注）；题目有歧义可以取消市场，所有下注全额退还；截止后 7 天还没公布，市场自动取消并全额退款。

**盈亏与排名**：总资产 = 余额 + 还没结算的下注；盈利 = 总资产 − 累计获得的水滴（注册、签到）。排行榜默认按盈利排名，签到多不会让你排名更高。

## 安全

这是给熟人用的小工具，但基本的东西都做了：

- 密码使用 scrypt + 随机盐哈希；登录失败按用户名限流（15 分钟 10 次）
- 会话 token 只存哈希，Cookie 为 `httpOnly` + `SameSite=Lax`，HTTPS 下自动加 `Secure`
- 所有写操作只接受 `application/json`，配合 SameSite Cookie 防 CSRF
- 所有输入都经过 zod 校验；SQL 全部参数化
- 资金变动都在 SQLite 事务里完成，并记入 `ledger` 流水表，可审计

默认未登录也能浏览市场、排行榜和个人主页（和 Polymarket 一样，下注需要登录）。如果要放到公网，建议设置 `INVITE_CODE` 和 `PRIVATE_MODE=true`，并在前面加一层 HTTPS 反向代理（Nginx / Caddy）。

## 界面风格与黑夜模式

界面参照非凸科技官网（ft.tech）的设计语言：浅色底、品牌蓝 `#1C55FB`、PingFang / 微软雅黑系统字体、4px 小圆角按钮、蓝色下划线标签页。顶栏右侧的太阳/月亮按钮可以切换**黑夜模式**，选择会记在浏览器里，默认是日间模式。

所有颜色都是 [`apps/web/src/index.css`](apps/web/src/index.css) 里的设计变量：日间模式在顶部的 `@theme` 里，黑夜模式在下面的 `html.dark` 里，改配色只需要改这两处。
