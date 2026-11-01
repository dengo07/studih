/** Prompts for the AI features. Kept together so tone and format stay consistent. */

const FORMAT = `Reply in Markdown. Write math in LaTeX: $…$ inline, $$…$$ for display. Be accurate and concise.`;

export function baseSystem(subject?: string) {
  return `You are Studih, a study assistant built into a student's note-taking app.${
    subject ? ` The student is studying ${subject}.` : ""
  } ${FORMAT}`;
}

export type InlineAction = "explain" | "simplify" | "example" | "translate" | "cards" | "check";

export const INLINE_ACTIONS: { id: InlineAction; label: string; hint: string }[] = [
  { id: "explain", label: "Explain", hint: "Walk me through this" },
  { id: "simplify", label: "Simplify", hint: "Same idea, simpler words" },
  { id: "example", label: "Example", hint: "A worked example" },
  { id: "translate", label: "Translate", hint: "Into another language" },
  { id: "cards", label: "Make cards", hint: "Flashcards from this" },
  { id: "check", label: "Check me", hint: "Explain it back, get feedback" },
];

const TASKS: Record<InlineAction, (opts: { lang: string }) => string> = {
  explain: () =>
    "Explain the selected passage for a university student. Start with the core idea in one or two sentences, then the reasoning behind it. Add a tiny example only if it helps. Stay under 200 words.",
  simplify: () =>
    "Rewrite the selected passage in simpler words a first-year student would understand, keeping every fact correct. Return only the rewritten text, no preamble.",
  example: () =>
    "Give one or two concrete worked examples that illustrate the selected passage. Show the steps. If code helps, use a fenced code block with the language name.",
  translate: ({ lang }) =>
    `Translate the selected passage into ${lang}. Return only the translation, keeping formatting and math unchanged.`,
  cards: () =>
    'Write 3–6 flashcards that test real understanding of the selected passage (not trivia). Return ONLY a JSON array like [{"front": "question", "back": "short answer"}], with no prose before or after. Use $…$ for math inside strings.',
  check: () =>
    "The student has explained the selected passage in their own words. Compare their explanation with the passage. Say briefly what they got right, then what is missing or wrong, then ask one question that probes deeper. Be encouraging but precise.",
};

export function inlineSystem(action: InlineAction, opts: { subject?: string; lang: string }) {
  return `${baseSystem(opts.subject)}\n\n${TASKS[action](opts)}`;
}

export function inlineUserMessage(opts: { noteTitle: string; noteText: string; selection: string; studentAnswer?: string }) {
  const context = opts.noteText.length > 6000 ? `${opts.noteText.slice(0, 6000)}\n…` : opts.noteText;
  let msg = `Note: "${opts.noteTitle || "Untitled"}"\n\n<note>\n${context}\n</note>\n\n<selected_passage>\n${opts.selection}\n</selected_passage>`;
  if (opts.studentAnswer !== undefined) msg += `\n\n<student_explanation>\n${opts.studentAnswer}\n</student_explanation>`;
  return msg;
}

/** Pull the flashcard array out of a model reply, tolerating code fences or stray prose. */
export function parseCardsJson(reply: string): { front: string; back: string }[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(reply.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.front === "string" && typeof c.back === "string" && c.front.trim() && c.back.trim())
      .map((c) => ({ front: c.front.trim(), back: c.back.trim() }));
  } catch {
    return [];
  }
}

// ---- tutor ----

export type TutorMode = "explain" | "socratic" | "quiz";

export const TUTOR_MODES: { id: TutorMode; label: string; hint: string }[] = [
  { id: "explain", label: "Explain", hint: "Answers your questions" },
  { id: "socratic", label: "Socratic", hint: "Guides you with questions" },
  { id: "quiz", label: "Quiz me", hint: "Tests you, one question at a time" },
];

const TUTOR: Record<TutorMode, string> = {
  explain:
    "Answer the student's questions, using their notes below as the main context. If the notes are wrong or incomplete, say so politely and correct them. Prefer short answers; offer to go deeper.",
  socratic:
    "Act as a Socratic tutor. Do NOT give the final answer directly. Ask one guiding question at a time that builds on what the student said. Give a hint when they're stuck, and confirm clearly when they get there.",
  quiz:
    "Quiz the student on the material in their notes. Ask exactly one question at a time, mixing recall, application and 'why' questions, getting harder as they succeed. After each answer: mark it ✅, ⚠️ or ❌, explain briefly, then ask the next question. If the student just says to start, ask the first question immediately.",
};

export function tutorSystem(mode: TutorMode, notes: { title: string; text: string }[]) {
  let budget = 16000;
  const blocks: string[] = [];
  for (const n of notes) {
    if (budget <= 0) break;
    const text = n.text.slice(0, Math.min(budget, 6000));
    budget -= text.length;
    blocks.push(`<note title="${n.title.replace(/"/g, "'") || "Untitled"}">\n${text}\n</note>`);
  }
  return `${baseSystem()}\n\n${TUTOR[mode]}\n\nThe student's notes:\n\n${blocks.join("\n\n") || "(no notes attached)"}`;
}
