# 交易 API

所有 URL 以站点根路径下的 `/api` 开头，JSON 请求/响应。写请求使用 `POST` 和 `Content-Type: application/json`，没有参数时发送 `{}`。金额单位为水滴，价格 0.01–0.99，整数份额；不收手续费。

## 认证

`POST /auth/login` 发送 `{username, password}`，保存响应的 `wc_session` Cookie，此后在同一站点的请求中携带该 Cookie。`POST /auth/register` 可注册并登录，`GET /auth/me` 查询当前用户，`POST /auth/logout` 撤销当前会话。会话有效期、密码保护、登录限流和私有模式与网页一致；不得跨账户共用 Cookie。

一般情况下市场行情公开，`PRIVATE_MODE=true` 时也需要先登录。自己的订单、成交、持仓和交易操作始终要求登录。查询或取消他人的订单返回 404。

## 接口

| 方法 | 路径                                     | 参数/响应                                                                                         |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET  | `/markets?mode=polymarket&filter=active` | 现有市场列表，可用 `mode=pool` 或省略 mode；`limit` 最多 200                                      |
| GET  | `/markets/:id`                           | 现有市场详情与选项 ID                                                                             |
| POST | `/markets`                               | `{question, category, closeAt, mode:"polymarket", outcomes:["Yes","No"], description?}`           |
| GET  | `/trading/markets/:id/book`              | `{marketId, status, collateral, books, serverTime}`；每个 book 有 `outcomeId,bids,asks,lastPrice` |
| GET  | `/trading/markets/:id/trades`            | 分页公开成交，`limit,before`                                                                      |
| GET  | `/trading/account`                       | `{user, stats, positions, openOrders}`                                                            |
| GET  | `/trading/positions`                     | 本人的份额列表，包含数量、冻结量和市场状态；已结算持仓仅作历史记录                                |
| POST | `/trading/orders`                        | `{marketId, outcomeId, side:"buy"或"sell", price, quantity, clientOrderId?}`                      |
| GET  | `/trading/orders/:id`                    | 本人单笔订单                                                                                      |
| GET  | `/trading/orders`                        | 分页本人订单；可按 `marketId,status,clientOrderId` 过滤                                           |
| POST | `/trading/orders/:id/cancel`             | 撤销剩余数量，返回订单最新状态；已撤订单重复调用安全，已全部成交则 409                            |
| GET  | `/trading/trades`                        | 分页本人成交；可按 `marketId` 过滤                                                                |
| POST | `/trading/markets/:id/split`             | `{quantity}`；每 1 水滴生成 1 Yes + 1 No                                                          |
| POST | `/trading/markets/:id/merge`             | `{quantity}`；每对未冻结的 Yes/No 兑换 1 水滴                                                     |
| POST | `/markets/:id/resolve`                   | 创建者公布 `{outcomeId, note?}`，获胜每份兑付 1                                                   |
| POST | `/markets/:id/cancel`                    | 仅奖池市场允许创建者取消 `{note?}`；Polymarket 返回 403                                           |

已有网页使用的 `/markets/:id/orders`、`/exchange`、`/split`、`/merge` 等接口继续保留，共用同一个撮合与账本实现。

`/trading/account`、`/portfolio` 和用户统计中的 `stats.profit` 只统计已结算市场的全部账本净收支；`stats.netWorth = stats.funded + stats.profit` 为入账净值，不按挂单或最近成交价重估持仓。未结算市场的交易盈亏（即使已平仓）暂不计入这两项排名。`stats.balance` 是实际可用余额；`stats.staked = stats.netWorth - stats.balance` 为未结算净投入（含订单冻结资金），回款超过投入时可为负。保留现有字段名以兼容客户端，此口径无需数据库迁移，也适用于历史流水。

## 停止交易与结算时间

创建市场使用 `closeAt` 设置停止交易时间，另用 `settleAt` 设置结算时间，均为 Unix 毫秒；`settleAt >= closeAt`，两者均不能超过未来 5 年。省略 `settleAt` 时默认为 `closeAt`，旧市场也迁移为这两个时间相同。

到 `closeAt` 停止下注、下单和拆分/合并，未成交订单撤销并释放冻结资产；持仓保留。Polymarket 市场到 `settleAt` 后创建者才可调用 `/resolve` 公布结果并立即兑付，提前调用返回 409；奖池市场的创建者随时可以公布，提前公布会立即停止下注。Polymarket 市场不可取消，包括创建者手动取消和超时自动取消；未公布结果时保留持仓和抵押资金，一直等待结算，不会自动选择 Yes/No。撤销未成交订单仍受支持。列表和详情返回 `closeAt, settleAt`，详情另外返回实际结算时间 `resolvedAt`，Polymarket 不返回 `resolveBy`。奖池市场仍可由创建者主动取消，也会在 `settleAt + 7 天` 未公布时自动取消、全额退款，详情返回对应的 `resolveBy`。

## 订单与幂等

下单可增加布尔参数 `postOnly`，默认 `false`。设为 `true` 时只允许挂单：如果会与其他用户的普通订单或互补订单立即成交，即使只会成交一小部分，也返回 HTTP 409 并拒绝整笔订单，不产生订单记录、冻结资产或成交。成功挂入的订单仍可被之后的订单成交，查询响应包含 `postOnly` 标记。

所有新订单（含 Post-only）都禁止与自己的未成交挂单交叉，价格刚好相等也视为交叉；检查包含同一选项的买卖单及互补选项的同方向订单。发现交叉即返回 HTTP 409，提示冲突订单编号并要求先撤旧单或调整价格；旧单保持不变，新单不会冻结资产、产生订单记录或与其他用户部分成交。已成交和已撤销的订单不参与检查；已接受订单的幂等重试仍返回原订单。

`postOnly` 属于订单幂等参数，复用同一个 `clientOrderId` 时不能更改。被拒绝的订单不会占用客户端编号。

下单响应 HTTP 201，包括 `id,marketId,outcomeId,outcomeLabel,side,price,quantity,remaining,status,createdAt,clientOrderId`。`status` 为 `open`、`filled` 或 `cancelled`；部分成交仍为 `open`，`quantity-remaining` 是已成交量。已撤订单的 `remaining` 记录撤销量，已成交部分不会回滚。

`clientOrderId` 为同一用户全局唯一的 1–64 字符编号，只接受字母、数字和 `._:-`。相同编号、相同参数重复提交返回原订单最新状态（仍为 201），包括已经撤销、成交或市场截止的情况；更换参数返回 409。幂等查询和资产冻结在同一个 SQLite 事务中完成。可以通过 `/trading/orders?clientOrderId=...` 恢复请求状态。

未提供编号的原始 API 请求没有下单幂等保护；Python SDK 默认自动生成编号。拆分、合并和创建市场不是幂等操作，不可在网络失败后盲目重试。

## 分页与成交方向

订单和成交列表返回 `{items, nextCursor}`；`limit` 默认 50，范围 1–200。按 ID 倒序；`before` 是上一页的 `nextCursor`，为空表示没有下一页。游标不包含当前记录，翻页时保持过滤参数不变。

本人成交包含 `id,marketId,orderId,outcomeId,outcomeLabel,side,price,amount,quantity,role,kind,createdAt`。`role` 为 `maker/taker`，`kind` 为 `transfer/mint/merge`。`price` 始终按本人的选项返回。例如 Yes 买单 0.40 与 No 买单 0.60 成交，Yes 用户看到 0.40，No 用户看到 0.60。`amount=price×quantity`，是该笔成交金额，不是利润；`side` 表示买入或卖出。

公开市场成交以触发成交的订单（taker）的选项和价格记录，一次成交只出现一条；通过 `outcomeId` 区分 Yes/No。盘口按选项和买卖方向仅展示实际未成交挂单，同价汇总剩余份数，不展示互补换算报价。互补撮合仍正常执行；自己的订单不会与自己成交。所有时间为 Unix 毫秒。

市场列表及详情的 Polymarket 选项额外返回 `bestBid` / `bestAsk`：该选项实际买单的最高价、实际卖单的最低价，单位为每份水滴；没有对应挂单或交易已截止时为 `null`。网页展示这些挂单价，不将 `probability` 字段作为可成交报价；该字段仍保留用于兼容和内部估值。

## 错误

失败响应为 `{error: "说明"}`。400 表示参数无效、余额/份额不足或模式不符；401 未登录；403 无市场结算权限；404 对象不存在或订单不属于本人；409 市场/订单状态或客户端编号冲突；415 写请求不是 JSON；429 登录/注册限流。网络超时不代表写操作失败，需要先查询状态。

Python 使用方法见 [`sdk/python/README.md`](../sdk/python/README.md)。
