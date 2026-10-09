import { Children, isValidElement, memo, useEffect, useState, type ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Check, Copy, Image as ImageIcon } from "lucide-react";

export function CopyMessage({ text, label = "复制回答" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <button
      type="button"
      className="chat-copy"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("copied");
        } catch {
          setStatus("failed");
        }
      }}
    >
      {status === "copied" ? <Check size={13} /> : <Copy size={13} />}
      <span role="status">
        {status === "copied" ? "已复制" : status === "failed" ? "请选中文字复制" : label}
      </span>
    </button>
  );
}

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children)
        : String(child),
    )
    .join("");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(child) ? child.props.className : "";
  const language = /language-([\w+-]+)/.exec(className || "")?.[1] || "文本";
  return (
    <div className="chat-code">
      <div className="chat-code-head">
        <span>{language}</span>
        <CopyMessage text={textContent(children)} label="复制代码" />
      </div>
      <pre tabIndex={0} aria-label={`${language} 代码`}>
        {children}
      </pre>
    </div>
  );
}

// Never fetch model-provided remote images until the reader explicitly opens them.
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const local = Boolean(src && /^\/api\/assets\/[0-9a-f-]{36}$/.test(src));
  if (!src || (!local && !/^https?:\/\//i.test(src))) return <span>{alt || "图片"}</span>;
  return (
    <span className="chat-image">
      {!open && !local ? (
        <button type="button" onClick={() => setOpen(true)}>
          <ImageIcon size={16} />
          查看图片{alt && `：${alt}`}
        </button>
      ) : failed ? (
        <span>图片暂时无法显示</span>
      ) : (
        <img
          src={src}
          alt={alt || "回复中的图片"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      {(open || local) && (
        <a href={src} target="_blank" rel="noopener noreferrer">
          打开原图 ↗
        </a>
      )}
    </span>
  );
}

export const ChatMarkdown = memo(function ChatMarkdown({
  content,
  id,
}: {
  content: string;
  id: string;
}) {
  return (
    <div className="chat-markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        remarkRehypeOptions={{
          clobberPrefix: `chat-${id}-`,
          footnoteLabel: "注释",
          footnoteBackLabel: "返回正文",
        }}
        skipHtml
        urlTransform={(url) => {
          const safe = defaultUrlTransform(url);
          // Keep ordinary relative links and footnotes, but no active/custom URI schemes.
          return /^[a-z][\w+.-]*:/i.test(safe) && !/^(https?:|mailto:)/i.test(safe) ? "" : safe;
        }}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          h2: ({ node: _node, id: headingId, ...props }) => (
            <h2
              {...props}
              id={headingId === "footnote-label" ? `chat-${id}-footnote-label` : headingId}
            />
          ),
          table: ({ children }) => (
            <div
              className="chat-table"
              tabIndex={0}
              role="region"
              aria-label="回复中的表格，可横向滚动"
            >
              <table>{children}</table>
            </div>
          ),
          a: ({ node: _node, href, children, "aria-describedby": describedBy, ...props }) =>
            href ? (
              <a
                {...props}
                aria-describedby={
                  describedBy === "footnote-label" ? `chat-${id}-footnote-label` : describedBy
                }
                href={href}
                {...(!href.startsWith("#") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) => (
            <MarkdownImage
              key={typeof src === "string" ? src : alt}
              src={typeof src === "string" ? src : undefined}
              alt={alt}
            />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
});
