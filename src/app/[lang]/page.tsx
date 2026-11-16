import { notFound } from "next/navigation";
import FlyThrough from "@/components/flythrough/FlyThrough";
import Footer from "@/components/Footer";
import Guide from "@/components/Guide";
import Header from "@/components/Header";
import RegisterSection from "@/components/RegisterSection";
import StickyCta from "@/components/StickyCta";
import { getDict, isLocale } from "@/i18n/config";

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDict(lang);
  return (
    <>
      <Header lang={lang} t={t.nav} />
      <main>
        <FlyThrough hero={t.hero} chapters={t.chapters} />
        <Guide t={t.guide} />
        <RegisterSection lang={lang} t={t} />
      </main>
      <Footer t={t.footer} />
      <StickyCta label={t.nav.register} />
    </>
  );
}
