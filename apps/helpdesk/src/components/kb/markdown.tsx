import ReactMarkdown from "react-markdown";

/**
 * Markdown renderer for KB articles. react-markdown does not render raw HTML by default,
 * so article content can't inject scripts; links open safely in a new tab.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">
      <ReactMarkdown
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
