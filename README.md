# vibe-polymarket-monitor

Polymarket 仓位监控器。它会在 GitHub Actions 中每 3 小时运行一次，抓取指定账号当前的公开仓位与账户快照，计算相对前 1 次推送的变化，并把完整摘要推送到 Telegram。

## 功能

- 从 Polymarket 公开 `profile` 页面解析 `proxyAddress`
- 使用 Polymarket Data API 获取当前仓位
- 使用 Polymarket `accounting snapshot` 获取：
  - `Open Positions Value`
  - `Available Cash`
  - `Total Equity`
- 展示每个仓位的：
  - `Yes/No`
  - `shares`
  - `avgPrice`
  - `currentPrice`
  - `value`
  - `costBasis`
  - `PnL`
  - 相对前 1 次推送的 `value/currentPrice/shares` 变化
- 自动过滤：
  - 原始值或展示后等于 `0` 的 `shares/value` 仓位
  - 已结束市场
  - 已结算 / 可赎回仓位
- 按市场分组展示，市场按总仓位价值降序排列
- 每个市场内部的预测按单仓位价值降序排列
- Telegram 使用 `HTML` 模式加粗市场标题和预测标题
- 每个指标单独一行展示，降低长标题和长字段挤在一起的阅读压力
- 仅保存最近 `1` 次成功推送的快照
- Telegram 消息过长时自动拆成多条顺序发送，保持链接和排版可直接查看
- 把状态持久化到远程仓库的 `monitor-state` 分支

## 本地开发

要求：

- Node.js `>= 18`

安装：

```bash
npm ci
```

运行测试：

```bash
npm test
```

本地执行：

```bash
PM_ADDRESS=0x... \
TELEGRAM_BOT_TOKEN=... \
TELEGRAM_CHAT_ID=... \
npm start
```

## GitHub Actions 配置

需要在仓库 Secrets 中配置：

- `PM_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Action workflow 位于：

- `.github/workflows/polymarket-monitor.yml`

代码文件使用驼峰命名，例如：

- `src/fetchPm.js`
- `src/buildSnapshot.js`
- `src/buildDiff.js`
- `src/formatMessage.js`
- `src/sendTelegram.js`
- `tests/sendTelegram.test.js`

状态文件会保存在：

- `monitor-state` 分支
- `state/state.json`

## Telegram 前置条件

Bot 必须先收到你账号的一条消息，否则拿不到私聊 `chat_id`，也无法主动给你发消息。

如果你还没做这一步：

1. 在 Telegram 中打开你的 bot
2. 发送任意一条消息，例如 `/start`
3. 再执行一次 workflow

## 文档

- 设计文档：`docs/superpowers/specs/2026-03-31-polymarket-position-monitor-design.md`
- 实现计划：`docs/superpowers/plans/2026-03-31-polymarket-position-monitor.md`
- 中文技术架构：`docs/technical-architecture.zh-CN.md`
