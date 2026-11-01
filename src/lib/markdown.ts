import DOMPurify from "dompurify";
import katex from "katex";
import { Marked, type Tokens } from "marked";

/**
 * Pull `$$…$$` and `$…$` out before Markdown parsing (so `_` and `*` inside math survive),
 * leaving placeholders that are swapped back afterwards.
 */
function protectMath(md: string) {
  const math: { latex: string; display: boolean }[] = [];
  const hold = (latex: string, display: boolean) => {
    math.push({ latex: latex.trim(), display });
    return `@@MATH${math.length - 1}@@`;
  };
  // leave fenced/inline code alone
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  const out = parts
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p
            .replace(/\$\$([\s\S]+?)\$\$/g, (_, l) => hold(l, true))
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, l) => hold(l, true))
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, l) => hold(l, false))
            .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre, l) => pre + hold(l, false)),
    )
    .join("");
  return { text: out, math };
}

function restoreMath(html: string, math: { latex: string; display: boolean }[], render: (latex: string, display: boolean) => string) {
  return html.replace(/@@MATH(\d+)@@/g, (_, i) => render(math[+i].latex, math[+i].display));
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const forDisplay = new Marked({ gfm: true, breaks: false });

/** Markdown → sanitized HTML for reading (chat bubbles, AI panels). */
export function renderMarkdown(md: string): string {
  const { text, math } = protectMath(md);
  const html = restoreMath(forDisplay.parse(text, { async: false }), math, (latex, display) =>
    katex.renderToString(latex, { displayMode: display, throwOnError: false, output: "html" }),
  );
  return DOMPurify.sanitize(html);
}

const RUNNABLE_LANGS: Record<string, string> = { python: "python", py: "python", javascript: "javascript", js: "javascript" };

const forEditor = new Marked({ gfm: true });
forEditor.use({
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const runnable = RUNNABLE_LANGS[(lang ?? "").toLowerCase()];
      if (runnable) return `<pre data-code-run data-language="${runnable}">${escapeAttr(text)}</pre>`;
      return `<pre><code>${escapeAttr(text)}</code></pre>`;
    },
  },
});

/** Markdown → HTML that the note editor parses into its own nodes (math, runnable code). */
export function markdownToEditorHtml(md: string): string {
  const { text, math } = protectMath(md);
  let html = forEditor.parse(text, { async: false });
  // a display formula alone in a paragraph becomes a math block
  html = html.replace(/<p>\s*@@MATH(\d+)@@\s*<\/p>/g, (m, i) =>
    math[+i].display ? `<div data-math-block data-latex="${escapeAttr(math[+i].latex)}"></div>` : m,
  );
  html = restoreMath(html, math, (latex) => `<span data-math-inline data-latex="${escapeAttr(latex)}"></span>`);
  return DOMPurify.sanitize(html);
}
