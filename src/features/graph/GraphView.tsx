import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import { graphData, mastery, type GraphNoteRow } from "../../lib/repo";
import { useApp } from "../../store";

interface GNode {
  id: string;
  title: string;
  color: string;
  degree: number;
  mastery: number | null;
  cards: number;
}

interface GLink {
  source: string;
  target: string;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function GraphView() {
  const subjects = useApp((s) => s.subjects);
  const openNote = useApp((s) => s.openNote);
  const [raw, setRaw] = useState<{ nodes: GraphNoteRow[]; links: { from_note: string; to_note: string }[] } | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const box = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<NodeObject<GNode>> | undefined>(undefined);

  useEffect(() => {
    graphData().then(setRaw);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    if (!raw) return { nodes: [] as GNode[], links: [] as GLink[] };
    const colorOf = (sid: string | null) => subjects.find((s) => s.id === sid)?.color ?? cssVar("--faint");
    const visible = raw.nodes.filter((n) => !subjectFilter || n.subject_id === subjectFilter);
    const ids = new Set(visible.map((n) => n.id));
    const links = raw.links.filter((l) => ids.has(l.from_note) && ids.has(l.to_note)).map((l) => ({ source: l.from_note, target: l.to_note }));
    const degree = new Map<string, number>();
    for (const l of links) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }
    const nodes = visible.map((n) => ({
      id: n.id,
      title: n.title || "Untitled",
      color: colorOf(n.subject_id),
      degree: degree.get(n.id) ?? 0,
      mastery: mastery(n),
      cards: n.cards,
    }));
    return { nodes, links };
  }, [raw, subjects, subjectFilter]);

  // neighbours of the hovered node stay bright, everything else fades
  const neighbours = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    for (const l of data.links) {
      const s = typeof l.source === "object" ? (l.source as GNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as GNode).id : l.target;
      if (s === hover) set.add(t);
      if (t === hover) set.add(s);
    }
    return set;
  }, [hover, data.links]);

  const fg_ = cssVar("--fg");
  const line = cssVar("--faint");
  const accent = cssVar("--accent");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-8 pt-8 pb-4 text-sm">
        <h1 className="mr-2 font-serif text-2xl font-bold">Knowledge graph</h1>
        <Chip active={!subjectFilter} onClick={() => setSubjectFilter(null)}>All</Chip>
        {subjects.map((s) => (
          <Chip key={s.id} active={subjectFilter === s.id} onClick={() => setSubjectFilter(s.id)} color={s.color}>
            {s.name}
          </Chip>
        ))}
        <div className="ml-auto flex items-center gap-4 text-xs text-faint">
          <span className="flex items-center gap-1.5"><Dot alpha={1} /> well known</span>
          <span className="flex items-center gap-1.5"><Dot alpha={0.3} /> needs review</span>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border border-dashed border-faint" /> no cards</span>
        </div>
      </div>

      <div ref={box} className="relative mx-8 mb-8 flex-1 overflow-hidden rounded-2xl border border-line bg-panel">
        {raw && data.nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-muted">No notes yet. Type [[ in a note to link ideas.</div>
        )}
        <ForceGraph2D<GNode, GLink>
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={4}
          nodeVal={(n) => 1 + n.degree * 1.5}
          linkColor={(l) => {
            if (!neighbours) return line;
            const s = (l.source as GNode).id ?? l.source;
            return neighbours.has(s as string) && neighbours.has(((l.target as GNode).id ?? l.target) as string) ? accent : line;
          }}
          linkWidth={1.2}
          linkDirectionalParticles={0}
          cooldownTicks={120}
          onEngineStop={() => fg.current?.zoomToFit(400, 60)}
          onNodeHover={(n) => setHover(n?.id ?? null)}
          onNodeClick={(n) => openNote(n.id)}
          nodeLabel={(n) => `${n.title} · ${n.cards ? `${n.cards} cards, ${Math.round((n.mastery ?? 0) * 100)}% mastered` : "no cards"}`}
          nodeCanvasObject={(n, ctx, scale) => {
            const r = 4 * Math.sqrt(1 + n.degree * 1.5);
            const faded = neighbours && !neighbours.has(n.id);
            const alpha = faded ? 0.12 : n.mastery === null ? 0.55 : 0.25 + 0.75 * n.mastery;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
            if (n.mastery === null) {
              ctx.setLineDash([2, 2]);
              ctx.strokeStyle = n.color;
              ctx.lineWidth = 1.5;
              ctx.stroke();
              ctx.setLineDash([]);
            } else {
              ctx.fillStyle = n.color;
              ctx.fill();
            }
            if (scale > 1.2 || hover === n.id || n.degree >= 3) {
              const fontSize = Math.max(10 / scale, 3);
              ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = fg_;
              ctx.globalAlpha = faded ? 0.15 : 0.85;
              ctx.fillText(n.title.length > 28 ? `${n.title.slice(0, 27)}…` : n.title, n.x!, n.y! + r + 2);
            }
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, 4 * Math.sqrt(1 + n.degree * 1.5) + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      </div>
    </div>
  );
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-0.5 ${active ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:bg-hover"}`}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function Dot({ alpha }: { alpha: number }) {
  return <span className="inline-block size-2.5 rounded-full bg-accent" style={{ opacity: alpha }} />;
}
