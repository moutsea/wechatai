# 检查与发布

公开仓库的 main 和 Pull Request 都在 GitHub 托管 runner 执行检查，不再通过私有 SG 控制仓排队。Cloudflare 站点的原有完整检查、独立的 Go 检查和 Git 历史秘密扫描分别运行；PR 不接收生产凭据。

Go 检查覆盖格式、静态检查、带竞态检查的真实 SQLite 测试，以及不依赖 CGO 的 Linux 构建。Node、pnpm、Go 和 Actions 使用固定版本；更新 Go 时同步修改 `backend/go.mod` 和 workflow。

每次推送到 `main` 后，站点、Go 和秘密扫描三项检查全部通过，CI 会自动调用两个生产发布工作流。Cloudflare 发布前端、登录和支付入口，VPS 发布 Go 后端。两端发布前各自确认提交仍是 `main` 最新版本。需要重试单端时，可在 Actions 中手动运行对应工作流。账户迁移与代码发布独立。

待命发布仅启动本机健康探针。让 Go 接管账户时，发布和激活均要求完整账户能力就绪。通过 CI 代表对应的本地或模拟验证；真实微信、Stripe、模型供应商和生产迁移须单独验收。具体步骤见 `docs/go-backend-deployment.md`。
