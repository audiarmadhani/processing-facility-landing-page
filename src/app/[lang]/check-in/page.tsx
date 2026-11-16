import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CheckInPanel from "@/components/CheckInPanel";
import Header from "@/components/Header";
import { posterUrl, manifest } from "@/components/flythrough/manifest";
import { getDict, isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { title: `${getDict(lang).checkIn.title} — HEQA`, robots: { index: false } };
}

// Lightweight page for the QR code at the gate: no fly-through, straight to check-in.
export default async function CheckInPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDict(lang);
  const clip = manifest.clips[0].id;
  return (
    <>
      <Header lang={lang} t={t.nav} path="/check-in" />
      <main className="relative min-h-svh">
        <div className="absolute inset-x-0 top-0 h-[55svh] overflow-hidden">
          <picture>
            <source media="(max-aspect-ratio: 9/10)" srcSet={posterUrl(clip, "m")} />
            <img src={posterUrl(clip, "d")} alt="" className="h-full w-full object-cover" fetchPriority="high" />
          </picture>
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,41,27,.5),#00291b)]" />
        </div>
        <div className="relative mx-auto max-w-2xl px-5 pb-16 pt-[22svh] sm:px-8">
          <p className="eyebrow text-cream/70">HEQA · Singaraja</p>
          <h1 className="mt-3 font-display text-5xl tracking-[-0.02em] sm:text-6xl">{t.checkIn.title}</h1>
          <p className="mb-8 mt-4 text-cream/80">{t.form.checkInLead}</p>
          <CheckInPanel lang={lang} t={t} />
          <p className="mt-10 text-center text-sm text-cream/60">
            <a href={`/${lang}`} className="underline decoration-cream/30 underline-offset-4 hover:decoration-cream">{t.checkIn.backToSite} →</a>
          </p>
        </div>
      </main>
    </>
  );
}
