import { create } from "zustand";
import { logFocus } from "../../lib/plannerRepo";
import { getSettings } from "../../lib/settings";
import { notify } from "../../lib/notify";

export type Phase = "idle" | "focus" | "break";

export interface FocusDurations {
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  longEvery: number;
}

export const DEFAULT_DURATIONS: FocusDurations = { focusMin: 25, breakMin: 5, longBreakMin: 15, longEvery: 4 };

interface Persisted {
  phase: Phase;
  subjectId: string | null;
  /** Wall-clock end of the running phase; null while paused or idle. */
  endsAt: number | null;
  /** Remaining time while paused. */
  pausedMs: number | null;
  /** Total length of the current phase, for the progress ring. */
  phaseMs: number;
  /** Start of the current focus phase, for logging. */
  startedAt: number | null;
  cycles: number;
}

interface FocusState extends Persisted {
  durations: FocusDurations;
  now: number;
  loadDurations(): Promise<void>;
  setSubject(id: string | null): void;
  start(subjectId?: string | null): void;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
  skip(): Promise<void>;
  tick(): Promise<void>;
}

const KEY = "studih.focus";
const IDLE: Persisted = { phase: "idle", subjectId: null, endsAt: null, pausedMs: null, phaseMs: 0, startedAt: null, cycles: 0 };

function restore(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...IDLE, ...JSON.parse(raw) } : IDLE;
  } catch {
    return IDLE;
  }
}

function persist(s: Persisted) {
  try {
    const { phase, subjectId, endsAt, pausedMs, phaseMs, startedAt, cycles } = s;
    localStorage.setItem(KEY, JSON.stringify({ phase, subjectId, endsAt, pausedMs, phaseMs, startedAt, cycles }));
  } catch {
    // private mode etc.: the timer just won't survive a reload
  }
}

export function remainingMs(s: Pick<FocusState, "endsAt" | "pausedMs" | "now">) {
  if (s.pausedMs !== null) return s.pausedMs;
  if (s.endsAt === null) return 0;
  return Math.max(0, s.endsAt - s.now);
}

export const useFocus = create<FocusState>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch);
    persist(get());
  };

  const logElapsedFocus = async () => {
    const s = get();
    if (s.phase !== "focus" || s.startedAt === null) return;
    const minutes = (s.phaseMs - remainingMs(s)) / 60_000;
    if (minutes >= 1) await logFocus(s.subjectId, s.startedAt, Math.round(minutes * 10) / 10);
  };

  const begin = (phase: "focus" | "break", minutes: number) => {
    const ms = minutes * 60_000;
    update({ phase, endsAt: Date.now() + ms, pausedMs: null, phaseMs: ms, startedAt: phase === "focus" ? Date.now() : null });
  };

  return {
    ...restore(),
    durations: DEFAULT_DURATIONS,
    now: Date.now(),

    async loadDurations() {
      const s = await getSettings("focus.");
      const num = (k: string, d: number) => (Number(s[k]) > 0 ? Number(s[k]) : d);
      set({
        durations: {
          focusMin: num("focus.focusMin", DEFAULT_DURATIONS.focusMin),
          breakMin: num("focus.breakMin", DEFAULT_DURATIONS.breakMin),
          longBreakMin: num("focus.longBreakMin", DEFAULT_DURATIONS.longBreakMin),
          longEvery: num("focus.longEvery", DEFAULT_DURATIONS.longEvery),
        },
      });
    },

    setSubject: (subjectId) => update({ subjectId }),

    start(subjectId) {
      if (subjectId !== undefined) update({ subjectId });
      begin("focus", get().durations.focusMin);
    },

    pause() {
      const s = get();
      if (s.endsAt === null) return;
      update({ pausedMs: Math.max(0, s.endsAt - Date.now()), endsAt: null });
    },

    resume() {
      const s = get();
      if (s.pausedMs === null) return;
      update({ endsAt: Date.now() + s.pausedMs, pausedMs: null });
    },

    async stop() {
      await logElapsedFocus();
      update({ ...IDLE, subjectId: get().subjectId, cycles: get().cycles });
    },

    async skip() {
      const s = get();
      if (s.phase === "focus") {
        await logElapsedFocus();
        const cycles = s.cycles + 1;
        update({ cycles });
        begin("break", cycles % s.durations.longEvery === 0 ? s.durations.longBreakMin : s.durations.breakMin);
      } else {
        update({ ...IDLE, subjectId: s.subjectId, cycles: s.cycles });
      }
    },

    async tick() {
      set({ now: Date.now() });
      const s = get();
      if (s.phase === "idle" || s.endsAt === null || s.endsAt > s.now) return;
      if (s.phase === "focus") {
        const cycles = s.cycles + 1;
        if (s.startedAt !== null) await logFocus(s.subjectId, s.startedAt, s.phaseMs / 60_000);
        const long = cycles % s.durations.longEvery === 0;
        update({ cycles, startedAt: null });
        begin("break", long ? s.durations.longBreakMin : s.durations.breakMin);
        void notify("Focus session done 🎉", `Take a ${long ? s.durations.longBreakMin : s.durations.breakMin}-minute break.`);
      } else {
        update({ ...IDLE, subjectId: s.subjectId, cycles: s.cycles });
        void notify("Break's over", "Ready for another focus session?");
      }
    },
  };
});

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
