# 语言选择下拉验收记录

卡号：`e91d3210-4b3d-4a8f-95da-21235a1dd4db`，分支 `feature/wechatai-qvi`，PR base `main`。

- 评估基线 / 开发起点：`80cc35cc9e768390a7177f0af9a56fb074c6335f`（与当时 `origin/main` 相同）
- 功能验收提交（`pnpm check`、Playwright 与 axe 针对该提交树）：`b092f964214cba8bedb02a5cfd6ba3881f3fdd8d`
- 证据提交（仅 `internal-docs/`）：`aff3ed0517b9b39f90a0e684f95507d73f48b16b`，PR 最终 head 见 PR 页面

## 改动

- `src/client/language-switcher.tsx`：一个当前语种触发按钮 + `role="menu"` 下拉，候选项来自 `LocaleProvider.alternates`，保留真实 `href`、`hreflang`、韩文页的本地化名称和 `aria-current="true"`。支持外部点击、重复点击、选中关闭、Enter/Space、上下方向键、Esc 关闭并归还焦点；菜单内第一次 Esc 不冒泡到移动抽屉。
- `src/client/styles.css`：桌面页头下拉定位与焦点样式，移动抽屉内展开为纵向列表；页头固定高度不变。
- `src/client/site-header.tsx`、`src/client/site-footer.tsx`、`src/client/ui.tsx`：页脚/页头品牌链接改用可见品牌文本加视觉隐藏的本地化“首页”标签，消除 axe `label-content-name-mismatch`（页头与页脚均受影响）。
- `scripts/verify-seo.mjs`：预渲染检查改为断言闭合状态的单个触发按钮、当前语种文本，并确认无译文页面不渲染切换器。
- 客户端与浏览器测试：`test/i18n.client.test.tsx`、`test/i18n-ja.client.test.tsx`、`test/browser/i18n.spec.ts`、`test/browser/site-header.spec.ts`、`test/browser/public-pages.spec.ts`。

## 检查结果

- `pnpm check`：通过（oxlint、`tsc --noEmit`、workers 与 client Vitest、`vite build`、prerender 106 页、`verify-seo.mjs`），耗时 363s。
- `pnpm exec playwright test --config test/browser/playwright.config.ts test/browser/site-header.spec.ts test/browser/i18n.spec.ts`：18 passed。
- `test/browser/public-pages.spec.ts` 全量：115 passed（加入品牌链接可访问名称修正前的同版本实现；之后重跑受影响的语种组、日语页、英语文档与页脚断言：21 passed）。
- `test/i18n*.client.test.tsx`：38 passed。
- axe（独立临时脚本，`axe-core` 仅装在 `/tmp`，未加入依赖）：`/pricing`、`/en/pricing`、`/ja/pricing` × 1280/390 × 收起/展开，共 6 组扫描，0 violations。报告见 `axe-language-switcher.json`。
- 预渲染结构证据见 `language-switcher-header.html`；截图见 `language-switcher-desktop.png`、`language-switcher-390.png`。
- 内部文档隔离：`rg` 在 `public/`、`src/`、`dist/` 中未找到本文件名或标题；本地 `wrangler dev`（`dist/wechatai/wrangler.json`）中 `/internal-docs/wechatai-language-switcher-dropdown.md` 为 404，`/api/docs` 不返回本文内容。
- 桌面页头开合前后 `.site-header` 高度相同，≤65px（64px + 1px 边框）；390px 抽屉与菜单无横向溢出，菜单全部项可达。
