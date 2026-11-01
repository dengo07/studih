import { useEffect, useState } from "react";
import { useApp } from "../../store";
import { formatClock, remainingMs, useFocus } from "./focusStore";

/** Compact Pomodoro timer for the sidebar. */
export default function FocusTimer() {
  const f = useFocus();
  const subjects = useApp((s) => s.subjects);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void f.loadDurations();
    const id = window.setInterval(() => void useFocus.getState().tick(), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = f.phase === "idle" ? f.durations.focusMin * 60_000 : remainingMs(f);
  const progress = f.phase === "idle" || !f.phaseMs ? 0 : 1 - left / f.phaseMs;
  const paused = f.pausedMs !== null;
  const subject = subjects.find((s) => s.id === f.subjectId);
  const ring = f.phase === "break" ? "#10b981" : "var(--accent)";

  return (
    <div className="mx-3 mb-3 rounded-lg border border-line bg-raised">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2 text-left" title="Focus timer">
          <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0 -rotate-90">
            <circle cx="13" cy="13" r="10.5" fill="none" stroke="var(--line)" strokeWidth="3" />
            <circle
              cx="13"
              cy="13"
              r="10.5"
              fill="none"
              stroke={ring}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 10.5}
              strokeDashoffset={2 * Math.PI * 10.5 * (1 - progress)}
            />
          </svg>
          <span className="min-w-0">
            <span className="block font-mono text-sm font-semibold tabular-nums">{formatClock(left)}</span>
            <span className="block truncate text-[11px] text-faint">
              {f.phase === "idle" ? "Focus" : f.phase === "focus" ? (paused ? "Paused" : "Focusing") : "Break"}
              {subject && ` · ${subject.name}`}
            </span>
          </span>
        </button>
        {f.phase === "idle" ? (
          <TimerButton onClick={() => f.start()} title="Start focus">▶</TimerButton>
        ) : (
          <>
            <TimerButton onClick={() => (paused ? f.resume() : f.pause())} title={paused ? "Resume" : "Pause"}>
              {paused ? "▶" : "❚❚"}
            </TimerButton>
            <TimerButton onClick={() => f.skip()} title={f.phase === "focus" ? "Finish now, take a break" : "Skip break"}>
              ⏭
            </TimerButton>
            <TimerButton onClick={() => f.stop()} title="Stop">■</TimerButton>
          </>
        )}
      </div>
      {open && (
        <div className="border-t border-line px-2.5 py-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-faint">Subject</span>
            <select
              className="flex-1 rounded bg-transparent py-0.5 outline-none hover:bg-hover"
              value={f.subjectId ?? ""}
              onChange={(e) => f.setSubject(e.target.value || null)}
            >
              <option value="">None</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1.5 text-faint">
            {f.durations.focusMin}m focus · {f.durations.breakMin}m break · long break every {f.durations.longEvery}
            {f.cycles > 0 && ` · ${f.cycles} done this session`}
          </p>
        </div>
      )}
    </div>
  );
}

function TimerButton({ onClick, title, children }: { onClick(): void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="grid size-7 place-items-center rounded-md text-xs text-muted hover:bg-hover hover:text-fg">
      {children}
    </button>
  );
}
