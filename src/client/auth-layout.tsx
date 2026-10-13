import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";
import { Brand } from "./ui";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link to="/">
          <Brand light />
        </Link>
        <div>
          <div className="eyebrow">A LITTLE CLOSER, EVERY DAY</div>
          <h1>
            好用的 AI，
            <br />
            就在你的聊天框里。
          </h1>
          <p>
            把问题交给 AI，
            <br />
            把时间留给生活。
          </p>
          <div className="auth-art">
            <Sprout size={130} strokeWidth={0.8} />
            <div className="auth-art-circle" />
          </div>
        </div>
        <small>独立开发产品 · 非微信官方服务</small>
      </aside>
      <div className="auth-form-wrap">
        <Link to="/" className="back-link">
          ← 返回首页
        </Link>
        {children}
      </div>
    </div>
  );
}
