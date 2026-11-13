# 首页接入展示图

[ai-wechat-connections.png](ai-wechat-connections.png) 为图生图生成的原图。网站使用 `public/images/landing/` 下的 1280px 与 640px WebP，避免首屏加载原始 PNG。

- 方式：imagegen CLI，`edit`，`gpt-image-2`，high，1280 × 1024。
- 构图：DeepSeek / Claude / GPT 与 Muse / Hermes / OpenClaw 在上方，两行三列；连接线向下汇入微信。
- 完整提示词：[ai-wechat-connections.prompt.txt](ai-wechat-connections.prompt.txt)。
- 参考图使用官方素材组合而成；展示兼容接入，不表示官方合作或背书。

图生图输入：[构图与 logo 参考图](ai-wechat-connections-reference.png)。

## 品牌素材来源

- DeepSeek：[官方品牌素材库](https://github.com/deepseek-ai/awesome-deepseek-integration/tree/main/docs/_logo%20svg)，使用 `ICON.svg`。
- Claude：[官网](https://claude.com)，使用 `/icon.png` 中的橙色星芒，不使用 Anthropic 字母标。
- GPT：[OpenAI 品牌指南](https://openai.com/brand/)，参考项目已有 OpenAI 图形。
- Muse：[官网](https://muse.ai)，使用 `/images/favicon/app-squiggle.svg`。此 Muse 对应项目接入的 Meta 托管个人助理。
- Hermes：[官网](https://hermes-agent.nousresearch.com)，使用官网 `hermes-agent/icon.png` 中的人像标志。
- OpenClaw：[官网](https://openclaw.ai)，使用 `/brand/openclaw-mascot.svg` 中的红色吉祥物。
- 微信：[官网](https://weixin.qq.com)，提取页头双对话气泡 SVG。

## 前端场景中的品牌标志

「已有 Agent」功能卡片使用本地品牌素材：Muse 的 `public/images/plugins/muse.svg` 来自上述官网的 `app-squiggle.svg`，同时用于插件图标；Hermes 和 OpenClaw 复用已有的 `hermes-brand.webp`、`openclaw-brand.webp`。

模型功能卡片中的 Claude 图标使用官网下载的 `/icon.png`，保存为 `public/images/channels/claude.png`，替代通用星星图标。

微信图标 `public/images/landing/wechat-logo.svg` 提取自官网页头，保留双气泡路径与蒙版，将两条可见路径的白色填充调整为微信绿色 `#07C160`，用于浅色背景。

## 模型渠道展示

配置步骤中的渠道列表复用 `public/images/channels/` 下的本地 Logo。新增图标取自对应官网声明的 favicon，按比例缩至不超过 96px 后保存；MiniMax 和 OpenRouter 使用无损 WebP：

- 智谱：[BigModel 官网图标](https://www.bigmodel.cn/static/images/favicon.png)，保存为 `zhipu.png`。
- 火山方舟：[火山引擎官网图标](https://portal.volccdn.com/obj/volcfe/misc/favicon.png)，保存为 `volcengine.png`。
- MiniMax：[官网图标](https://www.minimax.io/favicon.ico)，保存为 `minimax.webp`。
- OpenRouter：[官网图标](https://openrouter.ai/favicon/glyph.png)，保存为 `openrouter.webp`。

## AI 生图功能卡片

`public/images/landing/ai-image-example.webp` 从用户提供的微信生图截图中裁出图片结果（318 × 425），转为 WebP；对话部分由前端样式重绘，不包含截图中的个人昵称。图片用于展示 AI 生图效果。

## 小薇头像

[xiaowei-avatar.png](xiaowei-avatar.png) 通过此前用户确认的 imagegen CLI/API 通道生成，模型 `gpt-image-2`，high，请求尺寸 1024 × 1024，服务实际返回 1254 × 1254；输出为不透明薄荷绿背景。最终提示词保存在 [xiaowei-avatar.prompt.txt](xiaowei-avatar.prompt.txt)。

形象为亲切、干练的成年女性助手，短发、绿色双叶发夹与云朵胸针，呼应微伴品牌和云端执行。网站使用 `public/images/plugins/xiaowei.webp`（384px）和 `xiaowei-96.webp`（96px），用于首页、文档与插件卡片。
