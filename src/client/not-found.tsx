import { Link } from "react-router-dom";
import { Brand } from "./ui";

export function NotFound() {
  return (
    <div className="guide-page">
      <header className="guide-header">
        <Link to="/" aria-label="微伴首页">
          <Brand />
        </Link>
      </header>
      <main className="guide-hero">
        <div>
          <span className="eyebrow">404 · PAGE NOT FOUND</span>
          <h1>这个页面没有找到。</h1>
          <p>可以回到首页，或前往使用文档继续了解微信 AI。</p>
          <div className="hero-actions">
            <Link className="button" to="/">
              回到首页
            </Link>
            <Link className="text-link" to="/docs">
              使用文档
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
