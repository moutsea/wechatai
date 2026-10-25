import { ArrowUpRight, BookOpen, Mail, MessageSquareText } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import {
  INFO_PAGES,
  INFO_PAGE_UPDATED_AT,
  SUPPORT_EMAIL,
  type InfoPageKind,
} from "../../shared/site-info";
import { useAuth } from "../auth";
import { SiteFooter } from "../site-footer";
import { Brand } from "../ui";

/** 「2026-10-24」→「2026 年 10 月 24 日」，让显示的日期永远跟随常量。 */
function formatUpdatedAt(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function Terms() {
  return (
    <article className="info-document" aria-label="服务协议正文">
      <section>
        <h2>1. 关于微伴与本协议</h2>
        <p>
          微伴（Wechatai，wechatai.app）是独立开发的微信 AI
          接入服务。本协议说明你使用本站网页、微信连接和插件时的基本规则。微伴与微信、腾讯及各模型供应商无官方关联。
        </p>
        <p>
          请在注册、购买或使用相关功能前阅读本协议及<Link to="/privacy">隐私政策</Link>
          。对条款有疑问时，可通过<Link to="/contact">联系我们</Link>
          获得说明。若你尚不具备独立订立合同所需的民事行为能力，请由监护人协助了解服务并依法使用。
        </p>
      </section>
      <section>
        <h2>2. 服务范围与第三方接入</h2>
        <p>
          微伴将微信消息转发给你配置的模型、搜索服务或
          Agent，并将结果传回微信，提供渠道与模型切换、会话管理、credits
          计量及已开放的插件功能。具体功能与数量限制以当前产品页面为准。
        </p>
        <p>
          模型、搜索和生图服务由你选择并配置 API Key 与服务地址；OpenClaw、Hermes 等 Agent
          运行于你连接的设备或服务。你需要取得相应使用权限，遵守这些服务的条款，并自行承担其费用、可用性与权限配置。
        </p>
        <p>
          主动选择 KimiSeek 一键导入后，系统会按当前身份关联或创建 KimiSeek 账户，生成专用 API Key
          并导入渠道与可用模型。KimiSeek 的余额、付款与服务规则独立于微伴，充值不会增加微伴
          credits。
        </p>
      </section>
      <section>
        <h2>3. 账户与安全</h2>
        <p>
          请使用你有权使用的邮箱、第三方登录账户与微信身份，并妥善保管登录凭据、API Key 和 Agent
          配对凭证。不要将他人的账户或密钥接入本站。发现未经授权的使用时，请及时撤销相关凭据并联系我们。
        </p>
        <p>
          绑定微信或启用插件后，相应消息、上下文和必要附件会被转交给你选择的服务。接入具备工具执行能力的
          Agent 时，请在 Agent 端谨慎配置文件、命令执行和外部服务权限。
        </p>
      </section>
      <section>
        <h2>4. 会员、credits 与付款</h2>
        <p>
          会员价格、权益、计费周期及 credits 套餐以<Link to="/app/billing">会员与 credits</Link>
          页面和付款确认页为准。会员费用、本站 credits 与第三方 API 费用分别计算；购买 Plus
          不包含上游模型或搜索服务费用。
        </p>
        <p>
          平台按网关边界的输入、最终输出及生成图片计量，具体换算规则见
          <Link to="/docs/credits">credits 说明</Link>。外部 Agent
          内部执行过程的模型费用由其供应商另行收取。每日赠送额度会刷新，不累计；购买和邀请奖励额度按相应页面规则保留。单次结算产生的欠额会抵扣后续可用额度。
        </p>
        <p>
          新购买的会员均为单次付费，到期手动续费；提前购买会顺延有效期。已有自动续费订阅仍可在工作台的「管理订阅」入口管理或取消后续续费，已付款权益保留至到期。遇到重复扣款、权益未到账或需要申请退款，请提供订单信息联系我们，我们会根据实际订单、使用情况及适用法律处理，不影响你依法享有的消费者权利。
        </p>
      </section>
      <section>
        <h2>5. 合理使用与内容权利</h2>
        <p>
          请勿利用服务从事违法活动，侵犯他人的隐私、知识产权或其他合法权益，传播恶意代码、批量骚扰他人，或绕过账户隔离、额度及访问限制。
        </p>
        <p>
          你应当有权提交所发送的文字、图片、文件及角色设定。为完成你请求的服务，微伴会在必要范围内存储、处理并向所选服务转发这些内容，不因你使用服务而取得其所有权。生成内容的权利与可用范围还可能受到上游服务条款及适用法律的影响。
        </p>
      </section>
      <section>
        <h2>6. AI 输出与服务可用性</h2>
        <p>
          AI
          可能生成不准确、过时或不完整的内容。请自行核实重要结果，涉及医疗、法律、投资或其他重大决策时应寻求合适的专业意见。角色扮演内容属于
          AI 模拟，不代表真实人物或专业服务。
        </p>
        <p>
          网络、微信接口、上游服务或你的 Agent
          离线可能导致延迟、失败或中断；提醒功能也依赖这些连接，不宜作为唯一的紧急通知渠道。我们会合理维护服务、处理故障，但不承诺所有第三方服务始终可用。
        </p>
      </section>
      <section>
        <h2>7. 停止使用、调整与争议</h2>
        <p>
          你可随时断开微信、停用插件、管理订阅或删除平台会话。账户注销及其他数据请求请联系我们。删除平台记录不会同步删除微信、模型供应商或外部
          Agent 已保存的内容。
        </p>
        <p>
          发生滥用、安全事件或法律要求时，我们可能限制相关功能，并在适当情况下提供说明和申诉渠道。服务或协议发生重要调整时，会通过适当方式告知；需要重新取得同意的事项将另行处理。本协议不排除或限制依法不能排除的责任及你的法定权利。争议可先联系我们协商，协商不成时依法处理。
        </p>
      </section>
    </article>
  );
}

function Privacy() {
  return (
    <article className="info-document" aria-label="隐私政策正文">
      <section>
        <h2>1. 适用范围与联系渠道</h2>
        <p>
          本政策说明微伴（Wechatai）为提供微信 AI
          接入服务而处理的信息，适用于本站网页、微信连接和已开放的插件。隐私及数据请求可发送至
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>。
        </p>
        <p>
          你自行连接的模型、搜索服务、Agent、微信及支付服务可能独立处理数据，其政策分别适用。请在接入前了解这些服务的处理方式。
        </p>
      </section>
      <section>
        <h2>2. 我们处理的信息与用途</h2>
        <ul>
          <li>
            <strong>账户与登录：</strong>邮箱、昵称、头像、身份验证状态、登录会话，以及选择 Google
            或 GitHub
            登录时返回的身份信息和必要授权凭据，用于注册、登录、账户关联与安全验证。邮箱密码以哈希形式保存。
          </li>
          <li>
            <strong>连接与配置：</strong>渠道地址、模型 ID、API
            Key、系统提示词、微信连接标识和凭据、插件设置，用于向你指定的服务发起请求并将结果发送到对应微信。
          </li>
          <li>
            <strong>聊天与附件：</strong>
            你发送的文字、微信提供的语音转写、图片及文件解析内容、模型回复、历史摘要和生成图片，用于完成对话、上下文管理和历史记录功能。Free
            没有网页历史查看权限，并不表示聊天数据不会为服务运行而保存。
          </li>
          <li>
            <strong>个人助理：</strong>
            你选择保存的笔记、账目、待办与提醒时间，用于查询、统计、导出和到期提醒；这些记录独立于聊天历史。
          </li>
          <li>
            <strong>付款与额度：</strong>订单、订阅标识与状态、金额、credits 变动、网关 token
            与图片计量、邀请关系及奖励状态，用于开通权益、结算、处理争议和防止重复发奖。
          </li>
          <li>
            <strong>运行与支持：</strong>请求时间、IP
            地址、浏览器信息、必要的错误和运行日志，以及你主动提供的反馈，用于安全防护、定位故障和回复请求。
          </li>
        </ul>
      </section>
      <section>
        <h2>3. 信息会被发送给谁</h2>
        <p>
          执行对话或插件任务时，微伴会将完成任务所需的消息、提示词、历史上下文或摘要及附件发送至你选择的模型、搜索、生图服务或
          Agent，并通过微信接口收发消息。联网插件可能将搜索词发送给搜索服务，向目标网站请求网页内容。
        </p>
        <p>
          Google、GitHub 参与你选择的登录流程。Cloudflare
          提供网站运行、数据库、对象存储与网络服务；Stripe
          处理支付，微伴保存订单及付款状态，不保存完整银行卡号或银行卡安全码。可查看
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cloudflare 隐私政策
          </a>
          与
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
            Stripe 隐私政策
          </a>
          。
        </p>
        <p>
          仅在你主动使用 KimiSeek 联通时，我们向 KimiSeek 发送站点来源、微伴用户
          ID；首次关联还发送邮箱、验证状态和昵称，用于关联或创建账户。已验证邮箱可匹配已有账户，未验证邮箱使用独立关联账户。KimiSeek
          将专用 API
          Key、可用模型与余额返回微伴；密钥仅在服务端传输并加密保存，不放入浏览器跳转地址。其独立处理规则见
          <a href="https://kimiseek.app/privacy" target="_blank" rel="noopener noreferrer">
            KimiSeek 隐私政策
          </a>
          。
        </p>
        <p>
          本站当前没有将你的聊天用于训练自有模型的功能。上游服务的保存、训练或使用规则由其政策与账户设置决定；微伴无法替代你对上游服务的选择和管理。
        </p>
      </section>
      <section>
        <h2>4. 存储、安全与保存期限</h2>
        <p>
          微伴使用 Cloudflare
          基础设施，并可能调用你配置在不同国家或地区的服务。数据可能在你所在地区之外传输或处理；本站不承诺所有数据都存储在中国大陆。涉及需要单独告知或同意的处理，应按适用要求办理。
        </p>
        <p>
          我们对模型及插件密钥、微信连接凭据采用服务端加密，按用户隔离账户数据，并通过身份验证和
          HTTPS
          保护访问。聊天处理需要服务端读取必要内容，因此并非只有你和上游能够解密的端到端加密通信。
        </p>
        <p>
          账户配置、会话及摘要、个人助理记录会为提供对应功能而保存，直到你通过相关功能删除或提出删除请求；必要的订单、账务、安全记录可能因核账、争议处理或法律要求继续保留，届时仅用于相应目的。
        </p>
        <p>
          尚未提交给模型的附件暂存有效期为 15
          分钟；已处理的文字或附件内容可能成为会话的一部分。平台生成图片的访问有效期通常为 30
          天，过期后进入清理流程。删除或过期不会自动清除微信、第三方服务或你的设备上已经保存的副本。
        </p>
      </section>
      <section>
        <h2>5. Cookie 与必要存储</h2>
        <p>
          本站使用必要的 Cookie
          维持登录、校验第三方登录与跨站关联请求，以及记录邀请归属。清除或阻止这些 Cookie
          可能导致退出登录、邀请识别失败或关联流程中断。你可以通过浏览器管理
          Cookie，也可以在账户菜单退出登录。
        </p>
      </section>
      <section>
        <h2>6. 访问统计</h2>
        <p>
          本站自己记录页面访问，用来判断哪些页面（例如各篇指南和落地页）真的有人看、流量从哪里来。这项统计不接入第三方统计服务，记录的内容限于：
          访问的页面路径、这次访问的来源站点主机名与推广参数（<code>utm_source</code>、
          <code>utm_medium</code>、<code>utm_campaign</code>
          ，只在会话开始时记录一次）、国家或地区、设备类别（手机、平板、桌面，依据 User-Agent
          与是否支持触摸判断）、访问时间，以及一个仅用于区分会话的随机编号。
        </p>
        <p>
          我们<strong>不保存</strong>你的原始 IP 地址、User-Agent
          字符串、完整网址或查询串，也不记录你在页面上的点击、输入和聊天内容。为了统计「有多少个不同的人看过」，服务端会把
          IP、User-Agent、当天日期与一段站点密钥一起做哈希，只保存哈希值；因为日期参与哈希，同一个人每天都会得到一个新值，所以本站只有「当日去重数」，没有能跨天追踪你的访客编号。
        </p>
        <p>
          会话编号保存在浏览器的 sessionStorage，关闭标签页即失效。统计数据保留 180
          天后自动清理，只用于了解页面使用情况和改进内容，不用于广告投放、用户画像或跨站追踪。登录后的工作台页面，以及验证邮箱、重置密码这类一次性链接页面，不计入统计。你的浏览器开启「请勿追踪（DNT）」或全局隐私控制（GPC）时，页面不会上报访问。
        </p>
        <p>
          注册时，浏览器会随邮箱注册请求或第三方授权流程传递当次访问的会话编号；服务端只在实际创建新账户后记录归因，用来判断哪些页面带来了注册。重复注册和已有账户登录不计为新注册。这条归因记录包含会话编号、落地页及来源信息，不含邮箱、姓名或账户
          ID，与其他统计数据一同在 180 天后清理。开启 DNT 或 GPC 时不传递这项归因信息。
        </p>
      </section>
      <section>
        <h2>7. 如何管理你的数据</h2>
        <ul>
          <li>
            在工作台修改或删除渠道、模型和插件，断开微信或外部 Agent，停止对应连接。撤销上游 API Key
            或第三方登录授权需在相应供应商处操作。
          </li>
          <li>
            使用微信清除或删除会话命令，或在工作台「我的账户」中选择「删除全部会话记录」。
            <code>/wx reset</code> 只重置上下文；具体命令以
            <Link to="/docs/commands">微信命令速查</Link>为准。
          </li>
          <li>
            个人助理记录需在对应插件中单独管理、导出或删除；清空聊天不会清空账本、笔记或提醒。删除个人助理配置会同时删除该配置下的记录并取消提醒。
          </li>
          <li>
            访问、更正、获取副本、注销账户、删除数据或其他隐私请求，可通过
            <Link to="/contact">联系我们</Link>
            提交。我们可能需要核实账户归属；如部分数据因法律或结算要求不能立即删除，会说明原因。
          </li>
        </ul>
      </section>
      <section>
        <h2>8. 未成年人、政策更新与反馈</h2>
        <p>
          本服务不面向不满 14
          周岁的儿童。若你发现儿童在未取得监护人适当同意的情况下向本站提供个人信息，请联系我们处理。其他未成年用户应在监护人指导下使用。
        </p>
        <p>
          政策变化会在本页更新日期，重要的数据处理变化会通过适当方式告知，并在适用时另行征得同意。若你对数据处理有疑问或投诉，可联系本页邮箱；这不影响你依法向有权机构提出投诉的权利。
        </p>
      </section>
    </article>
  );
}

function Contact() {
  return (
    <div className="contact-content">
      <section className="contact-email">
        <span className="contact-icon">
          <Mail size={24} aria-hidden="true" />
        </span>
        <h2>写信给我们</h2>
        <p>账户、付款、连接问题，或者一个新想法，都可以发到这里。</p>
        <a
          className="contact-address"
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("微伴 Wechatai 使用反馈")}`}
        >
          {SUPPORT_EMAIL}
          <ArrowUpRight size={20} aria-hidden="true" />
        </a>
        <span>点击邮箱，使用你的邮件应用发送。</span>
      </section>
      <div className="contact-grid">
        <section>
          <MessageSquareText size={22} aria-hidden="true" />
          <h2>让问题更容易定位</h2>
          <p>
            请说明发生了什么、操作步骤和大致时间。账户或付款问题可附上账户邮箱、订单号；错误截图请先遮挡个人信息。
          </p>
          <p className="contact-note">请勿发送密码、API Key、配对凭证或完整银行卡信息。</p>
        </section>
        <section>
          <BookOpen size={22} aria-hidden="true" />
          <h2>也许指南里就有答案</h2>
          <p>模型配置、微信命令、插件接入和 credits 规则，都整理在文档中。</p>
          <Link className="text-link" to="/docs">
            打开文档
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <p className="contact-privacy">
        数据访问、删除或账户注销申请，也可发送至同一邮箱，邮件主题注明「隐私与数据请求」。处理方式见
        <Link to="/privacy">隐私政策</Link>。
      </p>
    </div>
  );
}

export function SiteInfoPage({ kind }: { kind: InfoPageKind }) {
  const page = INFO_PAGES[kind];
  const { data: session } = useAuth();
  return (
    <div className="site-info-page">
      <header className="info-header">
        <Link to="/" aria-label="微伴首页">
          <Brand />
        </Link>
        <div>
          <Link to="/">回到首页</Link>
          <Link className="button small" to={session ? "/app" : "/register"}>
            {session ? "进入工作台" : "开始使用"}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main className="info-main">
        <div className="info-intro">
          <span className="eyebrow">{page.eyebrow}</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
          {kind !== "contact" && (
            <time dateTime={INFO_PAGE_UPDATED_AT[kind]}>
              更新日期：{formatUpdatedAt(INFO_PAGE_UPDATED_AT[kind])}
            </time>
          )}
        </div>
        <nav className="info-navigation" aria-label="支持与政策导航">
          {Object.values(INFO_PAGES).map((item) => (
            <NavLink key={item.path} to={item.path}>
              {item.title}
            </NavLink>
          ))}
        </nav>
        {kind === "terms" ? <Terms /> : kind === "privacy" ? <Privacy /> : <Contact />}
      </main>
      <SiteFooter />
    </div>
  );
}
