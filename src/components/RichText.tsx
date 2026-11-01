import katex from "katex";
import { Fragment, useMemo } from "react";
import { BLANK } from "../editor/cards";

type Part = { kind: "text" | "math" | "blank"; value: string };

/** Split card text into plain text, `$inline math$` and the cloze blank. */
export function parseRich(text: string): Part[] {
  const parts: Part[] = [];
  const re = /\$([^$\n]+?)\$|\{\{…\}\}/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ kind: "text", value: text.slice(last, m.index) });
    parts.push(m[0] === BLANK ? { kind: "blank", value: "" } : { kind: "math", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

interface Props {
  text: string;
  /** What to show in place of the blank: undefined → an empty gap, a string → the revealed answer. */
  answer?: string;
  className?: string;
}

export default function RichText({ text, answer, className }: Props) {
  const parts = useMemo(() => parseRich(text), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.kind === "text") return <Fragment key={i}>{p.value}</Fragment>;
        if (p.kind === "blank")
          return answer === undefined ? (
            <span key={i} className="cloze-gap">
              ?
            </span>
          ) : (
            <span key={i} className="cloze-answer">
              <RichText text={answer} />
            </span>
          );
        let html: string;
        try {
          html = katex.renderToString(p.value, { throwOnError: false });
        } catch {
          html = p.value;
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
