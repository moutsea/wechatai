# 支付、credits 与管理员通知

[返回 README](../README.md)

## 计费边界

微伴 credits 是平台服务额度，不包含用户的模型、搜索或生图供应商费用。默认规则：

```text
credits = (平台输入 tokens + 平台最终输出 tokens × 8) / 5000
          + 已验证结果图片数 × 5
```

使用固定的 `cl100k_base` tokenizer，在网关边界计量，不采用上游报告的 `usage`，也不统计远程 Agent 内部模型调用。内部按 0.001 credit 单位记账。系统命令不扣 credits，消息提醒插件属于 Plus 权益且不额外扣费。

请求不预扣；开始前余额须大于 0。成功后按实际结果结算，可能形成负余额，之后的每日赠送或充值会先偿还欠额。失败且无可用结果不扣费。每日赠送按北京时间刷新，不累计；购买和邀请奖励的永久额度不随每日刷新清空。

默认会员为月付 ¥9.90、年付 ¥88，均为单次购买，到期手动续费。历史银行卡订阅仍支持续费与取消。商品与规则见 `src/shared/billing.ts`；自部署修改价格时须同步 Stripe 价格，不能只改前端金额。

## Stripe 配置

不配置 Stripe 可以运行基础应用；支付购买不可用。使用自己的 Stripe 账户和 API Key，测试与正式环境分别配置。

`.dev.vars.example` 列出了密钥、价格 ID 和旧订阅门户配置。Webhook 路径为 `/api/billing/webhook`，订阅以下事件：

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.paid
customer.subscription.updated
customer.subscription.deleted
```

先验签、环境和 `metadata.service=wechatai`，再检查订单归属、金额、币种、价格、数量和到账状态。共用 Stripe 账户时，其他业务事件会被忽略。确认页查询可补偿回调延迟，但不会相信浏览器提交的“支付成功”。权益发放按 Checkout / Invoice ID 去重。

新 Checkout 使用单次付款模式，配置银行卡、支付宝和微信支付。实际可用性还取决于 Stripe 账户所在地区、币种和账户启用情况。退款、争议及历史订阅的特殊账单仍需人工审核，系统不会自动扣回已消耗额度。

## 配置脚本

`scripts/setup-stripe.mjs` 从被忽略的 `.stripe.local` 读取 `{ "test": "…", "live": "…" }`。默认只设置测试产品，正式产品需明确选择环境：

```sh
pnpm stripe:setup
WECHATAI_SITE_URL=https://your-domain.example pnpm stripe:setup --mode live
```

脚本仅创建或复用 `wechatai` 业务的产品、价格和门户，配置写到权限为 600 的 `.stripe-test.local` / `.stripe-live.local`，不会发起扣款。多个微伴独立部署共用同一个 Stripe 账户时，需要先设计不同的业务标识，不能依赖域名自动隔离商品。

本地安装 Stripe CLI 后，运行 `pnpm stripe:listen`，它只接受测试 Key，并将本地 Webhook secret 写入 `.dev.vars`。保持监听进程运行，再用测试卡联调。

正式 Webhook 可在 Stripe Dashboard 创建；也可在配置好私有生产配置后运行 `node scripts/setup-stripe-webhook.mjs`，该脚本先创建禁用的专属端点，站点验证后用 `--enable` 启用。不要反复生成新端点或覆盖其他业务配置。

`node scripts/verify-production.mjs` 检查正式目录、回调隔离和测试账户，不会付款；`--checkout` 会创建并关闭未付款 Checkout，只用于操作人员主动验证。

## 管理员微信付款通知

管理员先绑定微信并配置「消息提醒」插件，将其 Token 存为生产 Secret `BILLING_NOTIFY_TOKEN`。默认 `BILLING_NOTIFY_SCOPE=all`，覆盖会员购买、续费及 credits 购买；设为 `first_payment` 时只通知每位用户的首次成功付款。

通知只在 HTTPS、Stripe live 环境和 Token 配置完整时开启。消息包括购买用户、项目、实付金额、首次付款标记及订单号。测试模式、未到账订单和其他业务回调不排队。

核验付款并发放权益后，通知与订单 paid 状态在同一个 D1 事务中保存。后台立即尝试投递，生产每分钟 Cron 恢复未完成任务，最多重试 24 小时。每笔付款的幂等键固定，不复用示例里的订单号。

`billing_notification.state=accepted` 表示消息提醒插件已接收，不代表微信已经收到。用 `delivery_id` 查询 `/api/notify/{id}` 的最终回执。发送失败不会撤销已到账的权益。成功接收或重试到期后清除通知中的买家信息，保留去重和诊断字段。更换插件 Token 后须同步更新 Secret。
