# Third-party notices

## AgentFlowing

- Repository: https://github.com/moutsea/agentflowing
- Inspected revision: `586825da1f6d488b15cd19f93b43d5133eb5dbc7`
- License: MIT; original text in [licenses/agentflowing.txt](licenses/agentflowing.txt).
- Used as the reference for the React/Vite, Hono/Cloudflare, Better Auth/Drizzle and Stripe setup. The build secret cleanup script and authentication/billing foundation were adapted for a personal account model. Frontend, sessions, wallet and WeChat integration were written for this project.

## OpeniLink

- Hub reference: https://github.com/openilink/openilink-hub
- Inspected Hub revision: `1df2ebebb69a5099e94b3f254f069aca5e272eed`
- SDK reference: https://github.com/openilink/openilink-sdk-node
- Inspected SDK revision: `849177f044dff0672c00511b3fc95aaa1c80282b`
- SDK license: MIT; original text in [licenses/openilink.txt](licenses/openilink.txt).
- WeChat wire formats, API conventions and image decryption behavior were adapted from the SDK. The Hub was reviewed for product and implementation reference; its complete application was not copied.

Other dependencies retain their own package licenses. This notice does not assign an open-source license to the original application code. The product is independently developed and is not affiliated with Tencent, WeChat or model providers.

## gpt-tokenizer

- Version: 4.0.0 (pinned).
- Repository: https://github.com/niieani/gpt-tokenizer
- License: MIT; see the installed package LICENSE.
- Used server-side with the cl100k_base vocabulary for versioned, provider-independent platform metering. No provider pricing catalog is used.

## DeepSeek Harness (architecture reference)

- Repository: https://github.com/deepseek-ai/deepseek-harness (MIT).
- The web tools/provider separation and DeepSeek native search response conventions informed our independently implemented, bounded Workers web research adapter. No Harness runtime is bundled; no affiliation or compatibility guarantee is implied.

## Document extraction dependencies

- unpdf 1.8.1: https://github.com/unjs/unpdf (MIT), with bundled PDF.js (Apache-2.0). Used for PDF text extraction in Workers.
- fflate 0.8.3: https://github.com/101arrowz/fflate (MIT). Used to read bounded DOCX document XML.
- saxes 6.0.0: https://github.com/lddubeau/saxes (ISC). Used to parse DOCX XML without external entities.
- Original license texts are retained in the installed packages and bundled PDF.js distribution.

## Weixin plugin and image metadata

- Tencent openclaw-weixin: https://github.com/Tencent/openclaw-weixin (MIT). Reviewed upload wire format and encrypted image message fields for the independently implemented Workers image delivery path.
- image-size: https://github.com/image-size/image-size (MIT). Used to check generated raster image dimensions and format. Original license retained in the installed package.
