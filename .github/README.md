# 持续集成

推送到 `main` 或提交 Pull Request 时，GitHub Actions 在公开仓库的标准 `ubuntu-24.04` runner 上运行两个只读任务。运行日志见 [Actions](https://github.com/moutsea/wechatai/actions/workflows/ci.yml)。

- `check` 安装锁定依赖，初始化本地 Workers 和 D1 环境，运行 lint、类型检查、测试、构建和浏览器用例。随后验证 OpenClaw、微信接收器、Go 巡检服务、执行器和监控采集器，并检查发布包权限。
- `secrets` 使用 Gitleaks 扫描完整 Git 历史，日志会遮盖匹配到的敏感值。

生产发布步骤见[部署文档](../docs/deployment.md)。
