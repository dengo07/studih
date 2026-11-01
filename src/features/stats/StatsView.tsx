import { useEffect, useState } from "react";
import BarChart from "../../components/BarChart";
import { loadStats, type Stats } from "../../lib/statsRepo";
import { useApp } from "../../store";

const short = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`);

export default function StatsView() {
  const subjects = useApp((s) => s.subjects);
  const dueCount = useApp((s) => s.dueCount);
  const { openNote, startReview } = useApp.getState();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    loadStats(14).then(setStats);
  }, []);

  if (!stats) return <div className="p-10 text-muted">Crunching numbers…</div>;

  const subject = (id: string | null) => subjects.find((s) => s.id === id);
  const maxSubject = Math.max(1, ...stats.subjectWeek.map((s) => s.minutes));

  return (
    <div className="mx-auto max-w-4xl px-10 pt-10 pb-20">
      <h1 className="mb-6 font-serif text-3xl font-bold">Stats</h1>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Focus today" value={hm(stats.focusToday)} sub={`${hm(stats.focusWeek)} this week`} />
        <Tile label="Study streak" value={`${stats.streak} ${stats.streak === 1 ? "day" : "days"}`} sub={stats.streak ? "Keep it going" : "Study today to start one"} />
        <Tile
          label="Recall rate"
          value={stats.retention === null ? "—" : `${Math.round(stats.retention * 100)}%`}
          sub={stats.reviews30 ? `${stats.reviews30} ${stats.reviews30 === 1 ? "review" : "reviews"}, last 30 days` : "No reviews yet"}
        />
        <Tile label="Cards due" value={String(dueCount)} sub={dueCount ? "Review now →" : "All caught up"} onClick={dueCount ? () => startReview({}) : undefined} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Focus minutes" sub="Last 14 days">
          <BarChart
            title="Focus minutes per day, last 14 days"
            bars={stats.focusByDay.map((d) => ({ key: d.date, label: short(d.date), value: d.value }))}
            color="var(--accent)"
            unit="min"
            detail={(bar) => {
              const parts = stats.focusByDay.find((d) => d.date === bar.key)?.parts ?? [];
              return parts.map((p) => (
                <div key={p.subjectId ?? "none"} className="flex items-center gap-1.5 text-muted">
                  <span className="size-2 rounded-full" style={{ background: subject(p.subjectId)?.color ?? "var(--faint)" }} />
                  {subject(p.subjectId)?.name ?? "No subject"} · {p.value}m
                </div>
              ));
            }}
          />
        </Panel>
        <Panel title="Cards reviewed" sub="Last 14 days">
          <BarChart
            title="Cards reviewed per day, last 14 days"
            bars={stats.reviewsByDay.map((d) => ({ key: d.date, label: short(d.date), value: d.value }))}
            color="var(--accent)"
            unit="cards"
          />
        </Panel>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Focus by subject" sub="Last 7 days">
          {stats.subjectWeek.length === 0 ? (
            <Empty>Start the focus timer in the sidebar to track study time.</Empty>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {stats.subjectWeek.map((s) => (
                <li key={s.subjectId ?? "none"} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>{subject(s.subjectId)?.name ?? "No subject"}</span>
                    <span className="text-muted tabular-nums">{hm(s.minutes)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-hover">
                    <div className="h-full rounded-full" style={{ width: `${(s.minutes / maxSubject) * 100}%`, background: subject(s.subjectId)?.color ?? "var(--faint)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Needs attention" sub="Notes you know least well">
          {stats.weakest.length === 0 ? (
            <Empty>Make some cards (Quiz me, vocab tables, ✦ Make cards) to see which notes need work.</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {stats.weakest.map((n) => (
                <li key={n.id}>
                  <button className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-hover" onClick={() => openNote(n.id)}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: subject(n.subject_id)?.color ?? "var(--faint)" }} />
                    <span className="flex-1 truncate">{n.title || "Untitled"}</span>
                    <span className="text-xs text-faint">{n.cards} cards</span>
                    <span className="w-10 text-right text-xs text-muted tabular-nums">{Math.round(n.mastery * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`rounded-xl border border-line bg-raised p-4 text-left ${onClick ? "hover:border-faint" : ""}`}>
      <div className="text-xs text-faint">{label}</div>
      <div className="my-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </Tag>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-raised p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-faint">{sub}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
