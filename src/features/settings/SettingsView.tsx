import { useEffect, useState } from "react";
import { native, type Provider } from "../../lib/ai";
import { getSettings, setSetting } from "../../lib/settings";
import { isTauri } from "../../lib/db";
import { DEFAULT_DURATIONS, useFocus } from "../focus/focusStore";

const MODEL_HINTS: Record<Provider, { inline: string; tutor: string; options: string[] }> = {
  "claude-cli": { inline: "haiku", tutor: "sonnet", options: ["haiku", "sonnet", "opus"] },
  openrouter: {
    inline: "anthropic/claude-haiku-5.5",
    tutor: "anthropic/claude-sonnet-5.5",
    options: ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "anthropic/claude-opus-5.5"],
  },
};

export default function SettingsView() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [cliVersion, setCliVersion] = useState<string | null | undefined>(undefined);
  const [keySet, setKeySet] = useState<boolean | undefined>(undefined);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyMsg, setKeyMsg] = useState("");

  useEffect(() => {
    getSettings("").then(setValues);
    native<string | null>("claude_cli_version").then(setCliVersion, () => setCliVersion(null));
    native<boolean>("openrouter_key_status").then(setKeySet, () => setKeySet(false));
  }, []);

  const provider = (values["ai.provider"] as Provider) || "claude-cli";
  const update = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    void setSetting(key, value);
  };

  const saveKey = async (key: string) => {
    setKeyMsg("");
    try {
      await native("set_openrouter_key", { key });
      setKeySet(!!key.trim());
      setKeyDraft("");
      setKeyMsg(key.trim() ? "Saved to your system keyring." : "Key removed.");
    } catch (e) {
      setKeyMsg(`Couldn't save: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-10 pt-10 pb-20">
      <h1 className="mb-8 font-serif text-3xl font-bold">Settings</h1>

      <Section title="AI provider" desc="Used for the tutor and the ✦ AI actions in your notes.">
        <div className="grid gap-2 sm:grid-cols-2">
          <ProviderCard
            active={provider === "claude-cli"}
            onClick={() => update("ai.provider", "claude-cli")}
            title="Claude Code CLI"
            desc="Uses the `claude` CLI on this computer and your existing login. No API key needed."
            status={cliVersion === undefined ? "Checking…" : cliVersion ? `✓ Found ${cliVersion}` : "✗ `claude` not found on PATH"}
            ok={!!cliVersion}
          />
          <ProviderCard
            active={provider === "openrouter"}
            onClick={() => update("ai.provider", "openrouter")}
            title="OpenRouter"
            desc="Any model on openrouter.ai, pay-per-use with your API key."
            status={keySet === undefined ? "Checking…" : keySet ? "✓ API key saved" : "No API key yet"}
            ok={!!keySet}
          />
        </div>
      </Section>

      {provider === "openrouter" && (
        <Section title="OpenRouter API key" desc="Stored in your operating system's keyring, never in the app's database.">
          <div className="flex gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={keySet ? "•••••••• (saved) — paste a new key to replace" : "sk-or-…"}
              className="flex-1 rounded-lg border border-line bg-raised px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button className="ai-primary" disabled={!keyDraft.trim()} onClick={() => saveKey(keyDraft)}>
              Save
            </button>
            {keySet && (
              <button className="ai-ghost" onClick={() => saveKey("")}>
                Remove
              </button>
            )}
          </div>
          {keyMsg && <p className="mt-2 text-sm text-muted">{keyMsg}</p>}
          {!isTauri && <p className="mt-2 text-xs text-faint">Browser preview: the key goes through the local dev bridge to the same keyring.</p>}
        </Section>
      )}

      <Section title="Models" desc="Leave blank for the default. A fast model for quick actions keeps things snappy.">
        {(["inline", "tutor"] as const).map((purpose) => {
          const key = `ai.${provider}.model.${purpose}`;
          return (
            <label key={purpose} className="mb-3 flex items-center gap-3 text-sm">
              <span className="w-36 text-muted">{purpose === "inline" ? "Quick actions (✦ AI)" : "Tutor chat"}</span>
              <input
                list={`models-${provider}`}
                value={values[key] ?? ""}
                onChange={(e) => update(key, e.target.value.trim())}
                placeholder={`default (e.g. ${MODEL_HINTS[provider][purpose]})`}
                className="flex-1 rounded-lg border border-line bg-raised px-3 py-1.5 outline-none focus:border-accent"
              />
            </label>
          );
        })}
        <datalist id={`models-${provider}`}>
          {MODEL_HINTS[provider].options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Section>

      <Section title="Focus timer" desc="Pomodoro lengths, in minutes.">
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["focusMin", "Focus"],
              ["breakMin", "Short break"],
              ["longBreakMin", "Long break"],
              ["longEvery", "Long break every"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <span className="text-muted">{label}</span>
              <input
                type="number"
                min={1}
                max={k === "longEvery" ? 10 : 180}
                value={values[`focus.${k}`] ?? DEFAULT_DURATIONS[k]}
                onChange={(e) => {
                  update(`focus.${k}`, e.target.value);
                  void useFocus.getState().loadDurations();
                }}
                className="w-16 rounded-lg border border-line bg-raised px-2 py-1 outline-none focus:border-accent"
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Study planner" desc="How many minutes per day the planner may schedule.">
        <input
          type="number"
          min={15}
          max={720}
          step={15}
          value={values["planner.dailyMinutes"] ?? 120}
          onChange={(e) => update("planner.dailyMinutes", e.target.value)}
          className="w-24 rounded-lg border border-line bg-raised px-2 py-1 text-sm outline-none focus:border-accent"
        />
      </Section>

      <Section title="Translation" desc="Default target language for ✦ AI → Translate.">
        <input
          value={values["ai.translateTo"] ?? ""}
          onChange={(e) => update("ai.translateTo", e.target.value)}
          placeholder="English"
          className="w-60 rounded-lg border border-line bg-raised px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </Section>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="mb-3 text-sm text-muted">{desc}</p>}
      {children}
    </section>
  );
}

function ProviderCard(props: { active: boolean; onClick(): void; title: string; desc: string; status: string; ok: boolean }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-xl border p-4 text-left ${props.active ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-faint"}`}
    >
      <div className="mb-1 font-medium">{props.title}</div>
      <div className="mb-2 text-xs text-muted">{props.desc}</div>
      <div className={`text-xs ${props.ok ? "text-emerald-600 dark:text-emerald-400" : "text-faint"}`}>{props.status}</div>
    </button>
  );
}
