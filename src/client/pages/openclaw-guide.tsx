import { Link } from "react-router-dom";
import { museGuide } from "../../shared/muse-docs";
import type { RemoteAgentKind } from "../../shared/remote-agent";
import { hermesGuide } from "../../shared/hermes-docs";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { openClawGuide } from "../../shared/openclaw-docs";
import { localizedHref, useLocale } from "../locale";
import {
  hermesGuideEn,
  museGuideEn,
  openClawGuideEn,
} from "../../shared/i18n/en/data/developer-content-en";
import "./guide.css";

export function OpenClawGuide({ kind = "openclaw" }: { kind?: RemoteAgentKind }) {
  const { locale } = useLocale();
  const english = locale === "en";
  const guide = english
    ? kind === "muse"
      ? museGuideEn
      : kind === "hermes"
        ? hermesGuideEn
        : openClawGuideEn
    : kind === "muse"
      ? museGuide
      : kind === "hermes"
        ? hermesGuide
        : openClawGuide;
  return (
    <div className="guide-page protocol-page">
      <SiteHeader
        extra={
          <a href={`/developers/${kind}.md`}>{english ? "Markdown version" : "Markdown 版本"}</a>
        }
      />
      <main className="guide-article">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const target = href?.startsWith("/") ? localizedHref(locale, href) : href;
              return target && target !== href ? (
                <Link to={target}>{children}</Link>
              ) : (
                <a href={href}>{children}</a>
              );
            },
          }}
        >
          {guide}
        </Markdown>
      </main>
      <SiteFooter />
    </div>
  );
}
