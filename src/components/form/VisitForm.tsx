"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useRef, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { registerVisit, type RegisterResult } from "@/app/actions";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import { ARRIVALS, PURPOSES, STEP_FIELDS, baliToday, visitSchema, type VisitInput } from "@/lib/visit-schema";
import Icon from "../Icon";
import Confirmation from "./Confirmation";

type Props = {
  lang: Locale;
  t: Dict["form"];
  done: Dict["done"];
  mode?: "pre_registered" | "walk_in";
};

const ACKS = ["ack_safety", "ack_hygiene", "ack_photo", "health_ok", "consent_data"] as const;

export default function VisitForm({ lang, t, done, mode = "pre_registered" }: Props) {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Extract<RegisterResult, { ok: true }> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const walkIn = mode === "walk_in";

  const form = useForm<VisitInput>({
    resolver: zodResolver(visitSchema),
    mode: "onTouched",
    defaultValues: {
      mode,
      language: lang,
      party_size: 1,
      visit_date: baliToday(),
      arrival_time: "",
      marketing_ok: false,
      website: "",
    } as Partial<VisitInput>,
  });
  const { register, handleSubmit, trigger, formState, reset, watch } = form;
  const errors = formState.errors as FieldErrors<Record<string, unknown>>;
  const partySize = Number(watch("party_size") ?? 1);

  const err = (name: string) => {
    const m = errors[name]?.message as string | undefined;
    return m ? (t.errors[m as keyof typeof t.errors] ?? t.errors.required) : undefined;
  };
  const a11y = (name: string) => ({
    id: `${uid}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${uid}-${name}-err` : undefined,
  });

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const next = async () => {
    const fields = STEP_FIELDS[step].filter((f) => !(walkIn && f === "visit_date"));
    if (await trigger(fields)) {
      setStep((s) => s + 1);
      scrollTop();
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await registerVisit(values);
    if (res.ok) {
      setResult(res);
      scrollTop();
    } else if (res.fields) {
      // Server disagreed with a field: jump to its step.
      const bad = Object.keys(res.fields);
      const s = STEP_FIELDS.findIndex((fs) => fs.some((f) => bad.includes(f)));
      if (s >= 0) setStep(s);
      for (const [k, m] of Object.entries(res.fields)) form.setError(k as keyof VisitInput, { message: m });
    } else {
      setServerError(t.errors[res.error as keyof typeof t.errors] ?? t.errors.generic);
    }
  });

  if (result) {
    return (
      <div ref={topRef} className="scroll-mt-24">
        <Confirmation
          t={done}
          result={result}
          lang={lang}
          onAnother={() => {
            reset();
            setStep(0);
            setResult(null);
          }}
        />
      </div>
    );
  }

  const steps = t.steps;

  return (
    <div ref={topRef} className="on-cream scroll-mt-24 rounded-[1.75rem] bg-cream p-5 text-forest shadow-2xl shadow-black/30 sm:p-8">
      {/* Stepper */}
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label={t.title}>
        {steps.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-forest" : "bg-forest/15"}`} />
            <p className={`mt-2 text-xs ${i === step ? "font-medium text-forest" : "text-forest/50"}`}>
              <span className="tabular-nums">{i + 1}.</span> {label}
            </p>
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} noValidate>
        <input type="hidden" {...register("mode")} />
        <input type="hidden" {...register("language")} />
        {/* Honeypot: hidden from people, bots fill it in. */}
        <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
          <label>
            Website <input tabIndex={-1} autoComplete="off" {...register("website")} />
          </label>
        </div>

        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t.fields.full_name} error={err("full_name")} htmlFor={`${uid}-full_name`} errId={`${uid}-full_name-err`} className="sm:col-span-2">
              <input className="field-input" autoComplete="name" {...a11y("full_name")} {...register("full_name")} />
            </Field>
            <Field label={t.fields.email} error={err("email")} htmlFor={`${uid}-email`} errId={`${uid}-email-err`}>
              <input className="field-input" type="email" inputMode="email" autoComplete="email" {...a11y("email")} {...register("email")} />
            </Field>
            <Field label={t.fields.phone} hint={t.fields.phoneHint} error={err("phone")} htmlFor={`${uid}-phone`} errId={`${uid}-phone-err`}>
              <input className="field-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+62" {...a11y("phone")} {...register("phone")} />
            </Field>
            <Field label={t.fields.company} optional={t.optional} htmlFor={`${uid}-company`}>
              <input className="field-input" autoComplete="organization" {...a11y("company")} {...register("company")} />
            </Field>
            <Field label={t.fields.country} optional={t.optional} htmlFor={`${uid}-country`}>
              <input className="field-input" autoComplete="country-name" {...a11y("country")} {...register("country")} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {!walkIn && (
              <>
                <Field label={t.fields.visit_date} error={err("visit_date")} htmlFor={`${uid}-visit_date`} errId={`${uid}-visit_date-err`}>
                  <input className="field-input" type="date" min={baliToday()} {...a11y("visit_date")} {...register("visit_date")} />
                </Field>
                <Field label={t.fields.arrival_time} optional={t.optional} htmlFor={`${uid}-arrival_time`}>
                  <select className="field-input" {...a11y("arrival_time")} {...register("arrival_time")}>
                    <option value="">—</option>
                    {ARRIVALS.map((a) => (
                      <option key={a} value={a}>
                        {t.arrivalTimes[a]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label={t.fields.purpose} error={err("purpose")} htmlFor={`${uid}-purpose`} errId={`${uid}-purpose-err`}>
              <select className="field-input" defaultValue="" {...a11y("purpose")} {...register("purpose")}>
                <option value="" disabled>
                  —
                </option>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {t.purposes[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.fields.party_size} hint={t.fields.party_sizeHint} error={err("party_size")} htmlFor={`${uid}-party_size`} errId={`${uid}-party_size-err`}>
              <input className="field-input" type="number" inputMode="numeric" min={1} max={40} {...a11y("party_size")} {...register("party_size")} />
            </Field>
            {partySize > 1 && (
              <Field label={t.fields.companions} optional={t.optional} htmlFor={`${uid}-companions`} className="sm:col-span-2">
                <textarea className="field-input min-h-20" rows={2} {...a11y("companions")} {...register("companions")} />
              </Field>
            )}
            <Field label={t.fields.host_name} hint={t.fields.host_nameHint} optional={t.optional} htmlFor={`${uid}-host_name`}>
              <input className="field-input" {...a11y("host_name")} {...register("host_name")} />
            </Field>
            <Field label={t.fields.vehicle_plate} optional={t.optional} htmlFor={`${uid}-vehicle_plate`}>
              <input className="field-input uppercase" autoCapitalize="characters" placeholder="DK 1234 AB" {...a11y("vehicle_plate")} {...register("vehicle_plate")} />
            </Field>
            <Field label={t.fields.notes} hint={t.fields.notesHint} optional={t.optional} htmlFor={`${uid}-notes`} className="sm:col-span-2">
              <textarea className="field-input min-h-24" rows={3} {...a11y("notes")} {...register("notes")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <fieldset className="grid gap-3">
            <legend className="sr-only">{steps[2]}</legend>
            {[...ACKS, "marketing_ok" as const].map((name) => (
              <label
                key={name}
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition has-[:checked]:border-forest has-[:checked]:bg-forest/[0.04] ${
                  errors[name] ? "border-cherry" : "border-forest/15"
                } ${name === "marketing_ok" ? "mt-2 border-dashed" : ""}`}
              >
                <input type="checkbox" className="peer sr-only" {...register(name)} aria-invalid={errors[name] ? true : undefined} />
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-forest/40 text-transparent transition peer-checked:border-forest peer-checked:bg-forest peer-checked:text-cream peer-focus-visible:ring-2 peer-focus-visible:ring-forest peer-focus-visible:ring-offset-2">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                <span className="text-[15px] leading-snug">
                  {t.acks[name]}
                  {name === "marketing_ok" && <span className="ml-1 text-forest/50">({t.optional})</span>}
                  {errors[name] && <span className="mt-1 block text-sm text-cherry">{t.errors.ack}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {serverError && (
          <p role="alert" className="mt-6 rounded-xl bg-cherry/10 p-4 text-sm text-cherry">
            {serverError}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-full px-4 py-3 text-sm text-forest/70 hover:text-forest">
              ← {t.back}
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button type="button" onClick={next} className="group inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3.5 font-medium text-cream transition hover:bg-forest-soft">
              {t.next}
              <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={formState.isSubmitting}
              className="group inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3.5 font-medium text-cream transition hover:bg-forest-soft disabled:opacity-60"
            >
              {formState.isSubmitting ? t.submitting : walkIn ? t.submitCheckIn : t.submit}
              {!formState.isSubmitting && <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" />}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  optional,
  error,
  htmlFor,
  errId,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  optional?: string;
  error?: string;
  htmlFor: string;
  errId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-forest/45">{optional}</span>}
      </label>
      {children}
      {error ? (
        <p id={errId} className="mt-1.5 text-sm text-cherry">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-forest/55">{hint}</p>
      ) : null}
    </div>
  );
}
