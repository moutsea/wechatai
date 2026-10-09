import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, BookOpen, Check, MessageCircle, ArrowRight } from "lucide-react";
import { Brand } from "../ui";
import { useAuth } from "../auth";
import { wechatCommands } from "../../shared/guide";
import "./guide.css";

const sections = [
  ["start", "从第一条消息开始"],
  ["models", "配置渠道与模型"],
  ["plugins", "DS Chat"],
  ["commands", "微信命令速查"],
  ["sessions", "管理不同的话题"],
  ["credits", "Credits 与会员"],
  ["faq", "常见问题"],
] as const;

export function Guide() {
  const { data: session } = useAuth();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <div className="guide-page">
      <header className="guide-header">
        <Link to="/" aria-label="微伴首页">
          <Brand />
        </Link>
        <div>
          <Link to="/">回到首页</Link>
          <Link className="button small" to={session ? "/app" : "/register"}>
            {session ? "进入工作台" : "开始使用"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main>
        <section className="guide-hero">
          <div>
            <span className="eyebrow">
              <BookOpen size={15} /> THE WECHATAI GUIDE
            </span>
            <h1>
              在熟悉的微信里，
              <br />
              用好你的 AI。
            </h1>
            <p>
              AI in 微信（AI in WeChat），从连接自己的大模型开始。
              <br className="guide-desktop-break" />
              这份微信 AI 使用指南，带你配置渠道、切换话题和管理额度。
            </p>
            <div className="guide-meta">
              <span>
                <Check size={14} /> 无需登录即可阅读
              </span>
              <span>适用于 Free 与 Plus</span>
            </div>
          </div>
          <div className="guide-preview" aria-label="微信命令使用示例">
            <div className="guide-preview-top">
              <MessageCircle size={19} />
              <span>给对话，一个新的开始</span>
            </div>
            <div className="guide-bubble user">
              <code>/new</code>
            </div>
            <div className="guide-bubble">已开始新的会话，原会话已保留。</div>
            <div className="guide-preview-note">一个新话题，一段清爽的上下文。</div>
          </div>
        </section>
        <div className="guide-layout">
          <aside className="guide-toc">
            <nav aria-label="教程目录">
              <span>这份指南里有什么</span>
              {sections.map(([id, title], i) => (
                <a key={id} href={`#${id}`}>
                  <small>0{i + 1}</small>
                  {title}
                </a>
              ))}
            </nav>
            <p>
              随时在微信发送 <code>/help</code>，就能再次找到这份指南。
            </p>
          </aside>
          <div className="guide-article">
            <section id="start" className="guide-section">
              <span className="guide-section-number">01 / GET STARTED</span>
              <h2>从第一条消息开始</h2>
              <ol className="guide-steps">
                <li>
                  <strong>添加渠道和模型</strong>
                  <p>
                    在工作台的「渠道与模型」页面添加渠道，填写协议、API Key 和服务地址。
                    点击渠道卡片中的「获取可用模型」一键导入，也可以手动添加模型
                    ID。同一渠道的模型共用连接配置。
                    模型卡片的「测试连接」会实际调用模型，并按用量消耗 credits。
                  </p>
                  <Link to="/app/channels" className="text-link">
                    去配置渠道与模型 <ArrowUpRight size={14} />
                  </Link>
                </li>
                <li>
                  <strong>连接你自己的微信</strong>
                  <p>
                    进入「微信连接」，创建链接并获取二维码，用微信扫码并在手机上确认。页面显示「已连接」后，打开微信
                    OpenClaw / Hermes 插件中对应的对话。
                  </p>
                </li>
                <li>
                  <strong>
                    发送 <code>/help</code>，认识你的新入口
                  </strong>
                  <p>
                    连接成功后，发送第一条消息即可收到欢迎消息和教程入口。发送 <code>/help</code>{" "}
                    不消耗 credits；也可以直接提问，微伴会在发送教程后正常回答你的问题。
                  </p>
                </li>
              </ol>
              <div className="guide-note">
                Free 最多创建 1 个微信链接，Plus 最多 10
                个。每条链接独立保存会话、当前模型和上下文，共用账户 credits
                与渠道配置。断开后重新扫码不占新名额，删除链接可释放名额且保留聊天记录。会员到期后仅第一条链接继续可用，其余暂停，续费后恢复（凭据过期需重新扫码）。微伴只回应各链接绑定的微信本人的消息。同一次连接只发送一次欢迎消息；断开后重新扫码连接，会再次发送招呼和命令速查链接。
              </div>
            </section>
            <section id="models" className="guide-section">
              <span className="guide-section-number">02 / YOUR MODELS</span>
              <h2>配置渠道与模型</h2>
              <p>
                渠道是供应商或中转服务的连接配置，保存 API Key、服务地址和接口协议。
                每个渠道下可以添加多个模型，各自设置提示词、上下文长度和回复上限。 同一个模型 ID
                也可以分别添加到不同渠道。切换渠道或模型时，继续对应模型的会话，不混用其他模型的上下文。
              </p>
              <dl className="guide-fields">
                <div>
                  <dt>显示名称</dt>
                  <dd>
                    取一个容易辨认的名字，例如「日常问答」或「写作润色」。它不会改变实际调用的模型。
                  </dd>
                </div>
                <div>
                  <dt>接口协议</dt>
                  <dd>
                    按供应商说明选择 OpenAI Chat Completions、OpenAI Responses 或 Anthropic
                    Messages。
                  </dd>
                </div>
                <div>
                  <dt>服务地址</dt>
                  <dd>
                    填写供应商的公网 HTTPS 服务地址，例如 <code>https://api.openai.com</code>
                    。无需手写接口后缀：三种协议分别自动补全 <code>/v1/chat/completions</code>、
                    <code>/v1/responses</code> 和 <code>/v1/messages</code>
                    。已有的后缀不会重复添加，自定义网关前缀会保留。
                  </dd>
                </div>
                <div>
                  <dt>渠道 Key 与模型 ID</dt>
                  <dd>
                    API Key 只需在渠道中填写一次，加密保存，编辑时留空表示保持原 Key。 模型 ID
                    可点击「获取可用模型」从上游导入，也可手动添加，需要与 Key 权限匹配。
                    自动导入会跳过已有模型，保留它们的设置和会话，不消耗 credits；每个渠道最多 50
                    个模型，超过上限会提示未导入的数量。
                    上游不支持模型列表接口时请手动添加。列表中的模型是否支持当前聊天协议，仍以供应商说明和测试连接结果为准。
                    修改渠道连接配置会应用于全部所属模型。 已保存模型的 ID
                    和所属渠道保持固定；使用其他 ID 时添加新模型，原会话继续保留。
                  </dd>
                </div>
                <div>
                  <dt>系统提示词</dt>
                  <dd>
                    可选，用来设置回答语言、风格和要求。默认是「你是一个友好、可靠的助手。请用清晰简洁的中文回答。」可以修改或清空；修改后发送{" "}
                    <code>/reset</code>，避免旧对话影响新设置。
                  </dd>
                </div>
              </dl>
              <p>
                在「更多设置」里可以分别调整输入 Token 上限、输出 Token 上限、模型上下文窗口和单轮
                credits 预算。较低的输入上限通常更省额度；输出上限过小可能让回答不完整。
              </p>
              <div className="guide-note">
                <strong>Plus 单次调用：</strong>为模型设置快捷名称「写作」后，发送{" "}
                <code>@写作 帮我润色这段文字</code>{" "}
                仅本次使用该模型，不改变默认模式。这类提问正常消耗 credits。
              </div>
            </section>
            <section id="plugins" className="guide-section">
              <p>
                使用自己的 OpenClaw Agent？
                <Link to="/developers/openclaw">查看接入与主动推送教程</Link>。 使用 Hermes？
                <Link to="/developers/hermes">查看 Hermes 接入教程</Link>。
              </p>
              <span className="guide-section-number">PLUS / WEB RESEARCH</span>
              <h2>DS Chat</h2>
              <p>
                这是微伴开发的聊天插件。在工作台「插件」添加 DS Chat
                配置：选择已有的回答模型，默认使用 DeepSeek 原生搜索并预填官方地址，填写你自己的
                DeepSeek API Key 即可。搜索模型 ID 可留空，自动使用 <code>deepseek-flash</code>，
                与回答模型独立。也可切换 Tavily、Exa、SearXNG
                或填写兼容服务地址。微伴不提供搜索密钥。
              </p>
              <p>
                发送 <code>/use DS Chat</code>（也支持自定义名称、快捷名或 <code>/plugins</code>{" "}
                列出的编号）进入默认插件模式，之后直接聊天即可。问候、写作、翻译、一般编程等问题直接回答；需要最新资料或核实时才搜索，阅读链接时按需读取网页。联网回答会附上取得的来源。
              </p>
              <p>
                模型可直接回答，也可调用搜索与网页阅读工具后继续回答。仅当上游明确不支持工具调用时，自动采用兼容方式；推荐选择支持工具调用的模型。新配置默认快捷名为
                DS，已有配置沿用原快捷名。
              </p>
              <div className="guide-note">
                <code>@DS 最近有什么 AI 新闻</code>{" "}
                只在本次使用插件，问答保留在当前会话，不改变默认模型或默认插件。单独发送 @名称
                不会进入插件。在 DS Chat 中也可以发送 <code>@画图 一只橘猫</code>{" "}
                临时生图，下一条普通消息仍由 DS Chat 回答。发送 <code>/use 画图</code>{" "}
                可直接切换为默认生图插件，无需先退出；发送 <code>/use DS Chat</code> 切回。
                <code>/exit</code> 返回进入插件前的普通会话；<code>/models</code> 后用{" "}
                <code>/model 编号</code> 切换普通模型。请使用自己配置的插件名称或快捷名。
              </div>
              <p>
                进入插件时使用独立会话，<code>/new</code>、<code>/reset</code>
                、归档和清空命令同样适用。退出只改变默认模式，不删除记录；再次进入会继续最近的活动会话。网页可以点击「设为默认插件」与「退出插件」。各微信链接分别保存默认模式。
              </p>
              <p>
                每次最多搜索 1–5 次、阅读 0–8
                个网页，可在配置中调整。网页须公开可访问；需要登录、纯脚本渲染的页面及 PDF
                暂不支持，遇到这些页面可直接粘贴正文，或将 PDF 作为微信文件发送。
              </p>
              <p>
                沿用所选模型的输入、输出与单轮 credits
                上限。平台仅计量传入插件的文本（包含实际带入的上下文）与最终回复，内部模型调用、搜索和阅读不重复计收；模型和搜索供应商仍会按自己的规则收取
                API 费用。测试功能会实际调用接口并消耗 credits。
              </p>
              <p>
                DeepSeek 搜索使用支持原生 Web Search 的 Anthropic 兼容 Messages 地址，搜索模型 ID
                留空默认使用 deepseek-flash。SearXNG 实例须启用 JSON 搜索接口，可不填密钥。插件仅限
                Plus，会员到期后配置保留，但停止调用。
              </p>
              <div className="guide-note">
                <strong>先发附件，再说要求：</strong>普通 LLM 对话和 DS Chat 都支持先发送图片、PDF、
                Word（.docx）或 TXT、Markdown、CSV 等纯文本，再发送文字或带微信转写的语音，例如
                “总结这份文件”或“比较这几张图”。附件暂存期间不调用模型、不扣 credits。 一批最多 4
                个，每个最大 5 MB，合计最大 8 MB；PDF 最多 100 页，每份文件正文最多 10 万字。
                附件保留 15 分钟，<code>/cancel</code>{" "}
                可清空；切换模型、插件或会话、重置和重新绑定后需重发附件。
                请求失败时可重新发送处理要求。图片需要模型支持视觉输入；文件提取正文处理，扫描版 PDF
                需先识别文字，旧版 .doc 请另存为 .docx。
              </div>
              <div className="guide-note">
                <strong>AI 生图：</strong>微伴不提供生图
                API。请先在「渠道与模型」配置你自己的生图服务地址、API Key 和模型 ID，渠道需支持
                /v1/images/generations 接口，再到插件页添加「AI 生图」并选择该模型。 发送{" "}
                <code>@画图 一只在窗边读书的橘猫，水彩风格</code> 单次生成，或{" "}
                <code>/use 画图</code> 进入生图模式，<code>/exit</code> 退出。 每条描述独立生成 1
                张图片，暂不支持参考图或连续改图。可在描述末尾加入“3:4”“16:9”或“9:16”等常见比例，平台会自动转换为尺寸参数；未写比例时使用上游默认设置，所选服务需支持对应尺寸。每张
                5 credits，描述文字另按输入 token 计费；沿用模型的输入和单次 credits 上限。
                图片会直接发到微信，网页历史也可查看原图；网页图片保留 30
                天，请及时下载。上游服务另行收费。
              </div>
              <Link to="/app/plugins" className="text-link">
                配置我的插件
                <ArrowRight size={15} />
              </Link>
            </section>
            <section id="commands" className="guide-section">
              <span className="guide-section-number">03 / QUICK COMMANDS</span>
              <h2>微信命令速查</h2>
              <p>
                在微信对话里单独发送以下命令。除标注 Plus 的功能外，Free 与 Plus
                均可使用。命令本身不调用模型，也不消耗 credits。编号前用空格分隔，例如{" "}
                <code>/model 2</code>。
              </p>
              <div className="guide-commands" role="table" aria-label="微信命令与功能">
                <div role="row" className="guide-command-head">
                  <span role="columnheader">发送命令</span>
                  <span role="columnheader">它会做什么</span>
                </div>
                {wechatCommands.map(([command, description]) => (
                  <div role="row" key={command}>
                    <code role="cell">{command}</code>
                    <span role="cell">{description}</span>
                  </div>
                ))}
              </div>
              <div className="guide-note">
                先发 <code>/channels</code>，用 <code>/channel 2</code>{" "}
                切换渠道（恢复该渠道上次使用的模型）。 再发 <code>/models</code>，用{" "}
                <code>/model 2</code> 切换当前渠道的模型。
                网页上每张渠道卡片内直接显示模型列表，点击模型旁的「使用」即可切换；点击「使用此渠道」恢复上次使用的模型。先发{" "}
                <code>/sessions</code> 再按列表编号切换会话。<code>/clear</code> 和{" "}
                <code>/delete</code> 会返回确认码，需在 60 秒内按提示再次发送才执行。
              </div>
            </section>
            <section id="sessions" className="guide-section">
              <span className="guide-section-number">04 / KEEP THINGS ORGANIZED</span>
              <h2>给不同的话题，留各自的空间</h2>
              <p>
                一个会话对应一个模型，并携带自己的对话上下文。工作、学习、日常提问可以分别开启会话，之后随时切换回来。
              </p>
              <div className="guide-session-grid">
                <div>
                  <code>/new</code>
                  <h3>换个话题</h3>
                  <p>新建会话，旧会话和记录都保留。</p>
                </div>
                <div>
                  <code>/reset</code>
                  <h3>让模型忘记前文</h3>
                  <p>留在当前会话，只让后续对话从新的上下文开始。</p>
                </div>
                <div>
                  <code>/archive</code>
                  <h3>先把话题收起来</h3>
                  <p>保留记录，开启新会话；以后可以恢复继续。</p>
                </div>
                <div>
                  <code>/clear · /delete</code>
                  <h3>永久清理</h3>
                  <p>清空消息，或连同会话一起删除。请留意确认提示。</p>
                </div>
              </div>
              <p>
                Plus
                可在网页「会话记录」中查看历史，并新建、重命名、切换、归档、恢复或清理会话。仅在网页查看一段记录不会改变微信当前会话，需要明确点击切换。
              </p>
              <p>
                Free
                仍可通过微信命令管理会话。所有用户都可以在工作台左下角的账户设置里清空平台上的全部会话记录。
              </p>
            </section>
            <section id="credits" className="guide-section">
              <span className="guide-section-number">05 / KNOW YOUR USAGE</span>
              <h2>用多少，清楚多少</h2>
              <p>
                Credits
                是微伴的平台用量单位。输入包括系统提示词、带入的历史对话和本次提问；输出是模型生成的回答。
              </p>
              <div className="guide-formula">
                <span>每次对话消耗</span>
                <strong>（输入 tokens + 输出 tokens × 8）÷ 5000</strong>
                <p>
                  例如：输入 1000 tokens，输出 250 tokens，共消耗 0.6 credits。按 0.001 credit
                  向上取整。
                </p>
              </div>
              <p>
                历史越长、回复越多，用量通常越高。换话题时使用 <code>/new</code> 或{" "}
                <code>/reset</code>
                ，能减少不必要的历史输入。供应商没有返回完整用量时，平台会使用估算值。
              </p>
              <p>
                长对话会自动整理：接近模型可用输入窗口的 80%
                时，将较早的对话压缩为摘要，尽量保留最近四轮完整对话。
                原始聊天记录仍然保留。摘要可能遗漏细节，重要内容可以重新提醒模型；上游明确报上下文超限时会缩减历史并重试一次。
              </p>
              <p>
                每个模型可独立设置上下文窗口，新模型默认 128K，最高
                2M，请以供应商实际支持的长度为准。 系统会预留回复空间和安全余量。摘要使用当前模型与
                API Key，但摘要和内部重试不额外扣本站 credits；模型供应商仍可能收费。
                整理后的摘要包含在后续实际输入中时计入输入 Token。重置或清空会话会同时清除摘要。
              </p>
              <p>
                还可以独立设置「输入 Token 上限」和「输出 Token
                上限」来控制消耗。实际输入取用户上限与模型可用窗口的较小值，
                包含提示词、摘要、历史和当前消息；达到有效上限的 80% 时提前整理。
                单条消息本身过长时会提示拆分。平台会独立校验输入并截取超限输出，上游窗口仍按保守估算控制。
              </p>
              <p>
                例如输入上限 32,000、输出上限 2,000，单次回答按上限估算约 9.6 credits。
                摘要同样遵守输入、输出上限，但不单独扣本站 credits；可通过「单轮 credits
                上限」进一步控制消耗。 Token 使用固定的 cl100k_base
                分词规则，由平台对实际输入和最终文字输出计数，不使用上游或插件报告的 usage。
                平台计数可能与模型供应商的账单不同，内部推理和工具日志不计入最终输出。
              </p>
              <div className="guide-plan-grid">
                <div>
                  <span className="tag">FREE</span>
                  <h3>先把日常对话用起来</h3>
                  <ul>
                    <li>每日赠送 credits，按北京时间零点更新，当日未用额度不累积。</li>
                    <li>自定义模型、文字对话与微信会话命令。</li>
                    <li>具体额度和渠道、会话数量上限以工作台显示为准。</li>
                  </ul>
                </div>
                <div>
                  <span className="tag green">PLUS</span>
                  <h3>让对话更好管理</h3>
                  <ul>
                    <li>每日赠送 1,000 credits，按北京时间零点刷新，当日未用额度不累积。</li>
                    <li>升级当天补足至 Plus 当日额度，更高的渠道、会话数量上限。</li>
                    <li>网页历史记录与会话管理、模型快捷名称。</li>
                    <li>
                      图片与文件问答：JPG、PNG、WebP、PDF、DOCX
                      及常见纯文本；图片需模型支持视觉输入。
                    </li>
                  </ul>
                </div>
              </div>
              <p>
                「会员与
                credits」可以查看余额和可购买的方案；独立的「额度明细」页面可以查看最近的用量与到账记录。单独购买
                credits 不会自动升级 Plus；价格、赠送额度和购买开放情况以该页面为准。
              </p>
              <div className="guide-note">
                你使用自己的 API Key，模型供应商的费用由供应商另外计算，微伴 credits
                不包含这部分费用。模型请求（含连接测试）不预扣额度，成功后按实际用量扣费，失败不扣费。
                余额大于 0 即可发起请求，余额为 0 或负数时暂停新请求。可选的单轮 credits
                预算限制本次输入与最终结果的本站扣费，设为 0 表示不限制；已有预算设置会保留。
                结算后余额可以为负数，欠额在次日赠送额度刷新、充值或会员额度到账时优先抵扣；未抵完的部分会继续保留，不会跨日清零。
              </div>
            </section>
            <section id="faq" className="guide-section">
              <span className="guide-section-number">06 / A LITTLE HELP</span>
              <h2>遇到问题，先看这里</h2>
              {[
                [
                  "如何获得邀请奖励？",
                  "在工作台「邀请好友」复制专属链接。好友通过链接注册并完成首次微信 AI 对话后，双方各得 500 credits，永久有效，可在「会员与 credits」和「额度明细」查看。支持邮箱、Google 和 GitHub 注册。每个新账户、同一微信仅能领取一次受邀奖励，已有账户不可补绑，也不支持自邀。",
                ],
                [
                  "连接了微信，为什么还没收到教程？",
                  "首次连接后，请先在微信发送 /help。微信需要你先发一条消息，微伴才能回复；/help 不会消耗 credits。你也可以直接从工作台左下角打开使用指南。",
                ],
                [
                  "模型测试失败，应该检查哪里？",
                  "先确认接口协议、服务地址、API Key、模型 ID 和供应商余额。服务地址只填公网 HTTPS 地址；如果提示服务跳转，请使用供应商提供的最终 API 地址。",
                ],
                [
                  "微信没有回复，怎么办？",
                  "先在网页确认微信仍是已连接状态，以及已有模型和可用 credits。发送一条新消息恢复回复窗口；如显示连接过期，请重新扫码。模型正在处理消息时，请等待它完成。",
                ],
                [
                  "可以发语音、图片或文件吗？",
                  "附带微信转写文本的语音可以按文字处理；没有转写时，请先使用微信转文字。Plus 可先发送图片、PDF、DOCX 或纯文本文件，再补充文字或语音要求。附件暂存 15 分钟，/cancel 可取消；普通 LLM 和 DS Chat 都适用。图片需要模型支持视觉输入；扫描版 PDF 请先识别文字，旧版 .doc 请转为 .docx。联网仍需配置自己的搜索服务。",
                ],
                [
                  "模型说自己不知道是什么模型，是否配置错了？",
                  "模型的自我介绍不能作为实际模型身份的可靠依据。请核对网页里的模型 ID 与供应商配置；/models 可以查看已配置的模型。微伴默认提示词没有隐藏模型身份的要求。",
                ],
                [
                  "删除记录、断开连接、会员到期有什么区别？",
                  "清空或删除会话只清理微伴平台记录，不会删除已发送到微信的消息或供应商记录。断开微信会停止接收和回复，模型配置与历史保留。Plus 到期后无法访问网页历史，已有记录不会自动删除。",
                ],
                [
                  "我的内容会发送到哪里？",
                  "为了生成回复，微伴会将系统提示词、本次消息和需要的历史上下文发送到你配置的模型服务。使用前请了解该供应商的数据处理方式；微伴是独立产品，与微信及腾讯无官方关联。",
                ],
              ].map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </section>
            <div className="guide-finish">
              <div>
                <h2>现在，发出你的第一条消息。</h2>
                <p>
                  从 <code>/help</code> 开始，也从一个好问题开始。
                </p>
              </div>
              <Link className="button" to="/app/wechat">
                前往微信连接 <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </main>
      <footer className="guide-footer">
        <Brand />
        <span>个人的 AI，熟悉的对话。独立产品 · 非微信官方服务</span>
        <Link to="/developers/plugins">插件开发文档</Link>
        <Link to="/">返回首页 ↑</Link>
      </footer>
    </div>
  );
}
