import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import VisitForm from "./form/VisitForm";

export default function RegisterSection({ lang, t }: { lang: Locale; t: Dict }) {
  return (
    <section id="register" className="relative scroll-mt-0 overflow-hidden bg-forest">
      {/* Q-mark watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/heqa-q.png" alt="" aria-hidden className="pointer-events-none absolute -right-40 -top-24 w-[42rem] max-w-none opacity-[0.05]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-10 sm:py-32 lg:grid-cols-[1fr_1.25fr] lg:gap-20 lg:px-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow text-cream/60">{t.form.eyebrow}</p>
          <h2 className="mt-4 font-display text-[clamp(2.5rem,6vw,5rem)] leading-[0.95] tracking-[-0.025em]">{t.form.title}</h2>
          <p className="mt-6 max-w-md text-lg text-cream/75">{t.form.lead}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/team.webp"
            alt={t.form.teamAlt}
            width={1200}
            height={1012}
            loading="lazy"
            className="mt-10 hidden aspect-[6/5] w-full max-w-md rounded-[1.25rem] object-cover lg:block"
          />
          <p className="mt-10 text-sm text-cream/55">
            <a href={`/${lang}/check-in`} className="underline decoration-cream/30 underline-offset-4 hover:decoration-cream">
              {t.nav.checkIn} →
            </a>
          </p>
        </div>
        <VisitForm lang={lang} t={t.form} done={t.done} />
      </div>
    </section>
  );
}
