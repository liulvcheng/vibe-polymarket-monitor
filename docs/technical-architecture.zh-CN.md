# 技术架构说明

## 1. 目标

这个项目的目标是以尽量低复杂度的方式，定时监控某个 Polymarket 账号的公开仓位变化，并把结果推送到 Telegram。

核心要求：

- 每 3 小时运行一次
- 推送当前总仓位价值
- 推送每个 active position 的关键字段
- 展示相对前 1 次推送的变化
- 不保存长期历史，只保留最近 1 次成功推送快照

## 2. 总体架构

系统由四部分组成：

1. GitHub Actions
2. Node.js 监控程序
3. Polymarket 公共数据源
4. Telegram Bot API

整体数据流如下：

1. GitHub Actions 按 cron 定时触发
2. Workflow 从 `monitor-state` 分支恢复上一次状态文件
3. Node.js 程序读取 Polymarket profile 页面，解析 `proxyAddress`
4. Node.js 程序调用 Polymarket Data API 获取当前仓位与总价值
5. 程序将原始数据标准化为内部快照结构
6. 程序与前 1 次快照做 diff
7. 程序格式化为一条或多条 Telegram 文本消息
8. 程序调用 Telegram Bot API 发送消息
9. 发送成功后，程序把最新快照写回 `state/state.json`
10. Workflow 将状态文件提交到 `monitor-state` 分支

## 3. 为什么先解析 profile 再查 Data API

Polymarket 的 profile URL 使用的是用户公开地址，但页面内部实际展示仓位时使用的是 `proxyAddress`。

因此程序不能直接假设：

- `PM_ADDRESS` 就等于 Data API 查询地址

而是要先做一次地址解析：

1. 请求 `https://polymarket.com/profile/<address>`
2. 从页面内嵌的 `__NEXT_DATA__` 中提取 `proxyAddress`
3. 再用 `proxyAddress` 请求：
   - `/value`
   - `/positions`

这样实现有两个好处：

- 对真实页面行为更一致
- 避免因为账号体系差异导致拿不到仓位

## 4. 模块划分

### `src/config.js`

负责读取并校验运行配置：

- `PM_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TZ`
- `STATE_FILE_PATH`

### `src/fetchPm.js`

负责和 Polymarket 通信：

- 读取 profile HTML
- 解析 `proxyAddress`
- 请求 `/value`
- 请求 `/positions`
- 做超时和一次重试

### `src/buildSnapshot.js`

负责把 Polymarket 原始响应转成内部统一结构。

每个仓位保留的关键字段包括：

- `market`
- `outcome`
- `shares`
- `avgPrice`
- `currentPrice`
- `value`
- `costBasis`
- `pnl`
- `pnlPercent`
- `endDate`
- `mergeable`
- `negativeRisk`

### `src/buildDiff.js`

负责比较：

- 当前快照 vs 前 1 次快照

比较指标包括：

- 仓位价值变化
- 当前价格变化
- 持仓数量变化

并额外识别：

- 首次运行
- 新增仓位
- 自上次推送后已关闭或不再 active 的仓位

### `src/formatMessage.js`

负责把内部数据格式化成可读的 Telegram 文本。

输出结构分为三层：

1. 总览摘要
2. 每个 active position 的编号单行明细
3. `prev1` 之后关闭的仓位列表

消息头会优先放：

- `Polymarket Profile` 链接
- 账号名和短地址
- 推送时间
- 当前总仓位价值
- 相对前 1 次推送的组合变化

每个仓位明细会：

- 使用序号
- 每个仓位只占一行
- 用固定字段顺序输出
- 用分号串联字段，压缩消息长度，避免同一市场多个仓位时消息过长

同时处理 Telegram 单条消息长度限制，必要时自动拆分多条消息。

### `src/sendTelegram.js`

负责发送 Telegram 消息并严格检查返回结果。

- 统一使用 `sendMessage`
- 当内容过长时，按格式化阶段切好的多段文本顺序发送
- 保持 `Polymarket Profile` 链接始终出现在聊天消息正文里，避免退化为附件后不可直接点开

### `src/main.js`

负责编排整个流程：

1. 读取状态
2. 拉取 Polymarket 数据
3. 构建快照
4. 计算 diff
5. 格式化消息
6. 发送 Telegram
7. 写回状态

## 5. 状态存储设计

状态文件路径：

- `state/state.json`

状态内容只保存最近 1 次成功推送的快照：

```json
{
  "address": "0x...",
  "snapshots": [
    {
      "sentAt": "2026-03-31T00:00:00.000Z",
      "totalValue": 701.38,
      "positions": []
    }
  ]
}
```

这样设计的原因：

- 满足“当前 vs 前 1 次”的比较需求
- 避免引入数据库
- 降低仓库噪音
- 失败回滚逻辑更简单

## 6. GitHub Actions 设计

Workflow 文件：

- `.github/workflows/polymarket-monitor.yml`

触发方式：

- `workflow_dispatch`
- 每 3 小时一次的 cron

运行步骤：

1. Checkout 默认分支
2. 安装 Node.js
3. `npm ci`
4. 从 `monitor-state` 恢复 `state/state.json`
5. 运行 `node src/main.js`
6. 成功后切换到临时状态分支工作树
7. 提交新的 `state/state.json`
8. 推送到远程 `monitor-state`

## 7. 失败策略

### Polymarket 拉取失败

- 当前任务失败
- 不覆盖旧状态

### Telegram 发送失败

- 当前任务失败
- 不覆盖旧状态

### 状态文件不存在

- 视为首次运行
- `prev1` 显示为 `N/A`

### 状态分支不存在

- Workflow 会按首次初始化逻辑创建

## 8. 安全边界

项目不保存以下敏感内容到仓库：

- Telegram bot token
- Telegram chat id
- 任何私钥或钱包授权信息

敏感配置全部通过 GitHub Actions Secrets 注入。

这个项目只读取公开页面和公开接口，不访问钱包、不签名、不依赖 Rabby 本地状态。

## 9. 测试策略

当前测试覆盖：

- 配置校验
- profile HTML 地址解析
- Polymarket 拉取与重试
- 快照标准化
- diff 计算
- Telegram 消息格式化与拆分
- Telegram 发送异常处理
- 主流程状态写入行为

测试使用 Node 内置 `node:test`，没有引入额外测试框架，保持依赖最小。

## 10. 当前已知外部依赖

要真正把消息推到手机上，还需要满足两个外部前提：

1. GitHub 仓库可写
2. Telegram bot 已经拿到你的私聊 `chat_id`

如果 bot 从未收到过你的消息，程序本身没有办法主动推送到你的 Telegram 私聊。
