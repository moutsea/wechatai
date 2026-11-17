# CI 执行位置

外部 Pull Request 的完整检查继续在 GitHub 托管 runner 上运行。公开仓库不注册持久 SG runner，避免外部 PR 代码接触共享主机。

原有 Gitleaks 任务也继续对每次 main 推送独立运行，及时发现泄漏，不必等待 SG 队列或应用测试；SG 的完整检查中仍保留历史扫描。

`main` 推送的 `Trusted main checks on SG` 把本次提交送到私有执行仓 `moutsea/wechatai-ci`，然后等待来源 SHA 与执行仓 SHA 均匹配的结果。SG 全部检查通过后公开仓才显示成功；失败、取消或等待超时显示失败。维护者可在[私有 CI 运行记录](https://github.com/moutsea/wechatai-ci/actions)查看详细日志，公开 Actions 的摘要会给出对应运行链接。

私有执行仓在 SG 上保留原完整检查：`setup:local`、公开内容扫描、lint、类型、Workers/D1 与客户端测试、构建、Playwright 浏览器测试、OpenClaw / receiver / executor / monitor 测试，以及 Gitleaks 全历史扫描。使用固定镜像的一次性 rootless 容器，限制 CPU / 内存，并加入其他项目共用的主机串行锁。

`SG_CI_BRIDGE_KEY` 是仅能写入私有执行仓的 SSH deploy key，只有受信任的 `main` 推送任务使用。它不是个人 GitHub token，也不是生产凭据。密钥不能提交到 Git；轮换时同步替换私有仓 deploy key 与本仓 Actions secret。

公开仓的轻量排队和等待任务仍在 GitHub 托管 runner 上运行，耗时测试在 SG 容器执行；没有把持久主机开放给公开 PR。私有执行仓的 `results` 分支仅保存检查结果，不触发新运行。

公开仓每次重跑都会生成新的请求标识，触发同一源码的完整 SG 检查，避免直接读回旧失败。升级 Node、pnpm 或 Playwright 时，也需同步核对私有执行仓的版本及浏览器镜像 digest。

原 CI 没有自动生产发布；本次接入保留该职责边界。生产部署仍按 `docs/deployment.md` 执行。SG 测试也不代表生产支付、真实微信消息、模型服务或提醒交付验收。
