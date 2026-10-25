import { hermesGuide } from "../../shared/hermes-docs";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { openClawGuide } from "../../shared/openclaw-docs";
import "./guide.css";

export function OpenClawGuide({ kind = "openclaw" }: { kind?: "openclaw" | "hermes" }) {
  return (
    <div className="guide-page protocol-page">
      <SiteHeader extra={<a href={`/developers/${kind}.md`}>Markdown 版本</a>} />
      <main className="guide-article">
        <Markdown remarkPlugins={[remarkGfm]}>
          {kind === "hermes" ? hermesGuide : openClawGuide}
        </Markdown>
      </main>
      <SiteFooter />
    </div>
  );
}
