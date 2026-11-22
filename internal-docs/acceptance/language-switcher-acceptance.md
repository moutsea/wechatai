# 语言选择下拉验收记录

卡号：`e91d3210-4b3d-4a8f-95da-21235a1dd4db`，分支 `feature/wechatai-qvi`，PR base `main`。

- `BASE_SHA`：`80cc35cc9e768390a7177f0af9a56fb074c6335f`（远端 `main`）。
- 首轮评审 `HEAD_SHA`：`2e14cec2bd7953008154a5f67ff3cbf42138e871`（`REVIEW_SCOPE: atomic`，FAIL）。
- 返工验收 `HEAD_SHA`：`d12a612eb3fc2301feadb4277558b8b5e6acbf9d`。下列检查在该提交上串行运行；其后的记录提交仅修改本文件，不改变构建、测试或截图输入。复审仍覆盖 `main` 到最终分支 HEAD 的整卡差异。

## 改动

- `src/client/language-switcher.tsx`：一个当前语种触发按钮 + `role="menu"` 下拉，候选项来自 `LocaleProvider.alternates`，保留真实 `href`、`hreflang`、韩文页的本地化名称和 `aria-current="true"`。支持外部点击、重复点击、选中关闭、Enter/Space、上下方向键、Esc 关闭并归还焦点；菜单内第一次 Esc 不冒泡到移动抽屉。
- `src/client/styles.css`：桌面页头下拉定位与焦点样式，移动抽屉内展开为纵向列表；页头固定高度不变。
- `src/client/site-header.tsx`、`src/client/site-footer.tsx`、`src/client/ui.tsx`：页脚/页头品牌链接改用可见品牌文本加视觉隐藏的本地化“首页”标签，消除 axe `label-content-name-mismatch`（页头与页脚均受影响）。
- `scripts/verify-seo.mjs`：预渲染检查改为断言闭合状态的单个触发按钮、当前语种文本，并确认无译文页面不渲染切换器。
- 客户端与浏览器测试：`test/i18n.client.test.tsx`、`test/i18n-ja.client.test.tsx`、`test/browser/i18n.spec.ts`、`test/browser/site-header.spec.ts`、`test/browser/public-pages.spec.ts`。

## 阻塞项返工

| 提交 | 首轮失败 | 同一回归修后证据 |
| --- | --- | --- |
| `112838324d2dc6a88b57174cf697b0e0718d59cc` | 98 个注册页用例用 `.site-language` 计数，同时命中隐藏抽屉，期望 1、实际 2。 | 注册页仍断言恰有一个可见切换器；无译文时对全部 DOM 实例断言为零。原 98 项均通过。 |
| `9c50608ad8356dc642a3035edbd41dc8ea9b492c` | `/pricing` 直接查找 `한국어` link，等待 30 秒超时。 | 原用例先打开 `语言：中文` 按钮，再选择 `한국어` menuitem；`/ko/pricing` URL、`html[lang]`、`og:locale` 与韩语内容断言均通过。 |
| `d12a612eb3fc2301feadb4277558b8b5e6acbf9d` | 页头夹具只登记英、日译文，桌面及 390px 附件仅有三项，且运行夹具会覆写附件。 | 本地 Worker 预览真实构建的 `/pricing`，两张截图均含四个语种。原夹具保留布局断言但不再写附件；跑完三份浏览器文件后，两张 PNG 的 SHA-256 与运行前一致。 |

## 检查结果

- `pnpm check`：通过（285s）。含 lint、`tsc --noEmit`、Workers Vitest 2,251/2,251、客户端 Vitest 389/389、构建、106 个公开页预渲染与 SEO 校验。预渲染期间有文件监听器 `ENOSPC` 日志，命令退出码为 0，预渲染及 SEO 校验均完成。
- 随后运行 `pnpm test:browser test/browser/public-pages.spec.ts test/browser/site-header.spec.ts test/browser/i18n.spec.ts --reporter=json`：232 passed，0 failed、0 skipped、0 flaky（137s）；分别为 214/214、15/15、3/3。首轮同一组三文件为 133 passed、99 failed。
- 真实构建、本地 Worker：键盘往返 `/pricing` → `/en/pricing` → `/pricing` 和 `/pricing` → `/ja/pricing` → `/pricing`；核对文档响应 200、URL、标题正文、`html[lang]`、`og:locale`、canonical、菜单 `href`/`hreflang`。
- axe-core 4.14.1 在本地真实构建的 `/pricing`、`/en/pricing`、`/ja/pricing` 上扫描页头：1280px、390px 各检查菜单收起和展开，共 12 次，0 violations；结果与 [axe 报告](axe-language-switcher.json) 一致。桌面开合均 65px；390px 下四项同时在视口内，页面、抽屉和菜单的横向溢出均为 0px。
- 真实 `/pricing` 展开态：[桌面 1280×844](language-switcher-desktop.png) · [移动 390×844](language-switcher-390.png)；[渲染结构](language-switcher-header.html)。
- 内部文档隔离：在 `public/`、`src/`、`dist/client/`、`dist/wechatai/` 中未发现需求文件名、文件名引用或标题。用 `dist/wechatai/wrangler.json` 启动本地 Worker，需求文档直链返回 404，匿名 `/api/docs` 返回 401；两处响应均不含本文标记。
- 开发返工不推送、不建 PR；「评审通过」阶段由 `codex-review` 维护唯一 OPEN PR（base `main`）。全流程禁止合并、禁止部署。
