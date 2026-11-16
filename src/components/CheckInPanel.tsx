"use client";

import { useState } from "react";
import { checkIn, type RegisterResult } from "@/app/actions";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import Confirmation from "./form/Confirmation";
import VisitForm from "./form/VisitForm";

export default function CheckInPanel({ lang, t }: { lang: Locale; t: Dict }) {
  const [tab, setTab] = useState<"registered" | "new">("registered");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<RegisterResult, { ok: true }> | null>(null);

  if (result) return <Confirmation t={t.done} result={result} lang={lang} />;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await checkIn(String(fd.get("ref") ?? ""), String(fd.get("email") ?? ""));
    setBusy(false);
    if (res.ok) setResult(res);
    else setError(t.form.errors[res.error as keyof typeof t.form.errors] ?? t.form.errors.generic);
  };

  return (
    <div>
      <div role="tablist" className="mb-6 inline-flex rounded-full bg-cream/10 p-1">
        {(["registered", "new"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-2 text-sm transition ${tab === k ? "bg-cream text-forest" : "text-cream/75 hover:text-cream"}`}
          >
            {k === "registered" ? t.checkIn.tabRegistered : t.checkIn.tabNew}
          </button>
        ))}
      </div>

      {tab === "registered" ? (
        <form onSubmit={onSubmit} className="on-cream grid gap-5 rounded-[1.75rem] bg-cream p-5 text-forest shadow-2xl shadow-black/30 sm:p-8">
          <div>
            <label htmlFor="ref" className="mb-1.5 block text-sm font-medium">{t.checkIn.ref}</label>
            <input id="ref" name="ref" required className="field-input font-display text-xl uppercase tracking-[0.08em]" placeholder="HQ-XXXXXX" autoCapitalize="characters" autoComplete="off" />
            <p className="mt-1.5 text-xs text-forest/55">{t.checkIn.refHint}</p>
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">{t.checkIn.email}</label>
            <input id="email" name="email" type="email" required className="field-input" autoComplete="email" inputMode="email" />
          </div>
          {error && <p role="alert" className="rounded-xl bg-cherry/10 p-4 text-sm text-cherry">{error}</p>}
          <button disabled={busy} className="rounded-full bg-forest px-6 py-3.5 font-medium text-cream transition hover:bg-forest-soft disabled:opacity-60">
            {busy ? t.form.submitting : t.checkIn.submit}
          </button>
        </form>
      ) : (
        <VisitForm lang={lang} t={t.form} done={t.done} mode="walk_in" />
      )}
    </div>
  );
}
