import { hermesGuide } from "../../shared/hermes-docs";
import { Link } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brand } from "../ui";
import { openClawGuide } from "../../shared/openclaw-docs";
import "./guide.css";

export function OpenClawGuide({ kind = "openclaw" }: { kind?: "openclaw" | "hermes" }) {
  return (
    <div className="guide-page protocol-page">
      <header className="guide-header">
        <Link to="/">
          <Brand />
        </Link>
        <nav>
          <a href={`/developers/${kind}.md`}>Markdown / Agent 阅读</a>
          <Link to="/app/plugins">配置插件</Link>
          <Link to="/register">免费开始</Link>
        </nav>
      </header>
      <main
        className="guide-article"
        style={{ maxWidth: 850, margin: "40px auto", padding: "0 24px" }}
      >
        <Markdown remarkPlugins={[remarkGfm]}>
          {kind === "hermes" ? hermesGuide : openClawGuide}
        </Markdown>
      </main>
    </div>
  );
}
