# 检查与发布

公开仓库的 main 和 Pull Request 都在 GitHub 托管 runner 执行检查，不再通过私有 SG 控制仓排队。Cloudflare 站点的原有完整检查、独立的 Go 检查和 Git 历史秘密扫描分别运行；PR 不接收生产凭据。

Go 检查覆盖格式、静态检查、带竞态检查的真实 SQLite 测试，以及不依赖 CGO 的 Linux 构建。Node、pnpm、Go 和 Actions 使用固定版本；更新 Go 时同步修改 `backend/go.mod` 和 workflow。

部署使用仓库内的同一套脚本，支持本地执行和受保护的 GitHub Actions 环境。Cloudflare 继续部署页面、登录与支付入口；VPS 部署 Go 后端。发布二进制与迁移账户数据分别执行，常规发布不切换账户路由，也不清理旧 DO。

待命发布仅启动本机健康探针。让 Go 接管账户时，发布和激活均要求完整账户能力就绪。通过 CI 代表对应的本地或模拟验证；真实微信、Stripe、模型供应商和生产迁移须单独验收。具体步骤见 `docs/go-backend-deployment.md`。
