# WeChatAI Go backend

VPS 按功能承接消耗 Durable Objects 资源的工作。登录、OAuth、Stripe 支付入口和 D1 继续由 Cloudflare 提供。

按大模块划分数据所有权，应用层编排跨模块事务，小模块的原子操作显式接受同一个 `*sql.Tx`。外部调用不占用数据库事务。

- [模块、交互与迁移约束](../docs/go-backend-architecture.md)
- [实现状态、构建、发布与备份](../docs/go-backend-deployment.md)
- [完整切换所需的能力](contract/contract.json)

```sh
go vet ./...
go test -race ./...
go run ./cmd/wechatai version
```

设置 `WECHATAI_DEPLOY_MODE=standby` 可在空账户目录上发布本机健康探针。接收器、巡检和执行器仍独立运行。整账户接管需要 `check-ready` 通过，并显式切换账户路由。
