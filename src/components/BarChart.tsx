import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Bar {
  key: string;
  label: string;
  value: number;
}

interface Props {
  bars: Bar[];
  color: string;
  unit: string;
  height?: number;
  /** Extra tooltip lines for a bar. */
  detail?: (bar: Bar) => ReactNode;
  /** Accessible name; also used as the table caption. */
  title: string;
}

/** Nice round axis max: 1, 2, 5 × 10^n. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * pow).find((m) => m >= v)!;
}

/**
 * Single-series column chart: thin bars rounded only at the data end, 2px gaps, a recessive
 * grid, and a hover tooltip per bar (with a hit area taller than the mark).
 */
export default function BarChart({ bars, color, unit, height = 160, detail, title }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(600);
  const box = useRef<HTMLElement>(null);
  const max = useMemo(() => niceMax(Math.max(...bars.map((b) => b.value))), [bars]);

  // draw at the real pixel width so axis text stays legible at any size
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = height;
  const pad = { l: 34, r: 4, t: 8, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / bars.length;
  const barW = Math.max(4, Math.min(28, slot - 2));
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const ticks = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max]; // no "0, 1, 1" axes
  // label every Nth bar so labels (~70px each) never collide; the last bar is always labelled
  const labelEvery = Math.ceil(bars.length / Math.max(2, Math.floor(W / 70)));
  const showLabel = (i: number) => i === bars.length - 1 || (i % labelEvery === 0 && bars.length - 1 - i >= labelEvery / 2);

  return (
    <figure ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--faint)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = pad.l + i * slot + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(b.value));
          const r = Math.min(4, barW / 2, h);
          // rounded top corners only; the base sits flat on the axis
          const path =
            h > 0
              ? `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`
              : "";
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={plotH + pad.b} fill="transparent" />
              {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {showLabel(i) && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
        >
          <div className="text-faint">{bars[hover].label}</div>
          <div className="font-semibold text-fg">
            {bars[hover].value} {unit}
          </div>
          {detail?.(bars[hover])}
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th>{b.label}</th>
              <td>
                {b.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
