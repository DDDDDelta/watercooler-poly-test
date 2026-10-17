# 💧 Watercooler · 茶水间预测市场

一个给同事们自己玩的 Polymarket 风格预测市场。用虚拟货币「水滴」押注团建去哪、周会多久、指数收在几点……价格就是大家的集体预期，猜对了水滴归你。

> 水滴没有任何现实价值，仅供娱乐。

## 功能

- **账号**：用户名 + 密码注册登录，可选邀请码；会话用 httpOnly Cookie，密码 scrypt 加盐哈希
- **市场**：是/否二元市场和多选一市场（2–10 个互斥选项），可设初始概率、流动性和截止时间
- **交易**：自动做市商（LMSR），随时可买可卖，前端实时报价、显示价格影响和潜在收益，带滑点保护
- **结算**：管理员选择结果，每份获胜份额兑付 1 水滴；也可以取消市场，按每人净投入退款
- **社交**：评论区、持仓榜、成交记录、全站成交滚动条、个人主页
- **排行榜**：按盈利 / 总资产 / 交易次数排名
- **经济系统**：注册送 1000 水滴，每日签到 +100，管理员可手动发放或扣除
- **管理后台**：待结算市场、用户列表、发放水滴、设置管理员、重置密码
- **移动端适配**：底部导航栏，交易面板自动排在图表下方

## 技术栈

pnpm monorepo，前后端全部 TypeScript：

```
apps/
  server/     Node.js + Hono + better-sqlite3（SQLite）
  web/        React 19 + Vite + Tailwind CSS v4 + TanStack Query + Recharts
packages/
  shared/     前后端共用：LMSR 做市商算法、API 类型、zod 校验规则
```

没有用 Next.js：这个项目就是一个 SPA + 一个 JSON API，分开更简单直接，部署时也只是一个 Node 进程（API 和前端静态文件由同一个服务提供）。前端报价和后端成交用的是 `packages/shared` 里同一份 LMSR 代码，保证预览和实际成交一致。

## 本地开发

需要 Node.js ≥ 20.19 和 pnpm（`corepack enable` 即可）。

```bash
pnpm install
pnpm seed        # 可选：生成演示用户和市场（admin / admin123，其他用户密码 demo123）
pnpm dev         # 前端 http://localhost:5173 ，API http://localhost:3000
```

如果不跑 seed，**第一个注册的用户自动成为管理员**。

常用命令：

| 命令                | 作用                                     |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | 同时启动前后端（热更新）                 |
| `pnpm test`         | 运行测试（LMSR 算法 + API 集成测试）     |
| `pnpm typecheck`    | 全部包类型检查                           |
| `pnpm format`       | Prettier 格式化                          |
| `pnpm build`        | 构建前端和后端                           |
| `pnpm start`        | 用构建产物启动生产服务（默认 3000 端口） |
| `pnpm seed --reset` | 删除数据库并重新生成演示数据             |

## 部署

### GitHub Actions 自动部署

推送到 `main` 后自动构建、测试并通过 SSH 部署到服务器（systemd + nginx 反向代理，支持部署在子路径下，失败自动回滚）。服务器一次性准备和需要配置的 Secrets 见 [`deploy/README.md`](deploy/README.md)。

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

| 变量                 | 默认值                | 说明                                                                    |
| -------------------- | --------------------- | ----------------------------------------------------------------------- |
| `HOST`               | `0.0.0.0`             | 监听地址，放在 nginx 后面时设为 `127.0.0.1`                             |
| `PORT`               | `3000`                | 服务端口                                                                |
| `BASE_PATH`          | 无（站点根目录）      | 部署在子路径下时设置，如 `/watercooler`；**构建前端和运行服务时都要设** |
| `DATABASE_PATH`      | `data/watercooler.db` | SQLite 文件路径                                                         |
| `INVITE_CODE`        | 无                    | 设置后注册必须填写邀请码                                                |
| `STARTING_BALANCE`   | `1000`                | 注册赠送水滴                                                            |
| `DAILY_BONUS`        | `100`                 | 每日签到奖励，`0` 关闭                                                  |
| `ADMIN_USERNAMES`    | 无                    | 注册后自动成为管理员的用户名，逗号分隔                                  |
| `ALLOW_USER_MARKETS` | `true`                | 普通用户能否创建市场                                                    |
| `PRIVATE_MODE`       | `false`               | 开启后必须登录才能看到任何内容                                          |
| `APP_TIMEZONE`       | `Asia/Shanghai`       | 每日签到按哪个时区算「今天」                                            |

## 玩法说明

**份额与价格**：每个选项是一种「份额」，市场结算时，获胜选项的每份兑付 1 水滴，其他选项归零。所以价格 0.63 就意味着市场认为这个结果有 63% 的概率发生。

**自动做市商（LMSR）**：不需要有人挂单，系统永远愿意按当前价格成交。你买入某个选项，它的价格就会上涨（其他选项下跌），所有选项的价格之和始终为 100%。流动性参数 `b` 越大，同样金额推动的价格越少；做市商最多亏损 `b × ln(选项数)` 水滴，由系统承担。

**结算**：交易截止后由管理员根据结算规则选择结果。管理员也可以在截止前提前结算（比如事情已经确定发生了）。如果题目有歧义，可以取消市场：每个人拿回「买入总额 − 卖出总额」（只退不扣）。

**盈亏与排名**：总资产 = 余额 + 持仓按当前价格估值；盈利 = 总资产 − 累计获得的水滴（注册、签到、管理员发放）。排行榜默认按盈利排名，签到多不会让你排名更高。

## 安全

这是给熟人用的小工具，但基本的东西都做了：

- 密码使用 scrypt + 随机盐哈希；登录失败按用户名限流（15 分钟 10 次）
- 会话 token 只存哈希，Cookie 为 `httpOnly` + `SameSite=Lax`，HTTPS 下自动加 `Secure`
- 所有写操作只接受 `application/json`，配合 SameSite Cookie 防 CSRF
- 所有输入都经过 zod 校验；SQL 全部参数化
- 资金变动都在 SQLite 事务里完成，并记入 `ledger` 流水表，可审计

默认未登录也能浏览市场、排行榜和个人主页（和 Polymarket 一样，交易需要登录）。如果要放到公网，建议设置 `INVITE_CODE` 和 `PRIVATE_MODE=true`，并在前面加一层 HTTPS 反向代理（Nginx / Caddy）。

## 换皮肤

所有颜色、字体都定义在 [`apps/web/src/index.css`](apps/web/src/index.css) 顶部的 `@theme` 里（`--color-brand`、`--color-yes`、`--color-no` 等），想换成公司配色改这里即可。
