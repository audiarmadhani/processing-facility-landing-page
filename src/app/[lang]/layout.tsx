import type { Metadata, Viewport } from "next";
import { Archivo, DM_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { getDict, isLocale, locales } from "@/i18n/config";
import { siteUrl } from "@/lib/site-url";
import "../globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", weight: ["400", "500", "600"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

const AVIF_TEST =
  "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAaQENBpMhAZQmMEwAA0AACQQM6Xt10S";

export const generateStaticParams = () => locales.map((lang) => ({ lang }));

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDict(lang);
  return {
    metadataBase: siteUrl(),
    title: t.meta.title,
    description: t.meta.description,
    alternates: { canonical: `/${lang}`, languages: { en: "/en", ja: "/ja" } },
    openGraph: { title: t.meta.title, description: t.meta.description, type: "website", locale: lang === "ja" ? "ja_JP" : "en_US" },
  };
}

export const viewport: Viewport = { themeColor: "#00291b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  // Japanese uses the system font (Hiragino / Noto / Yu Gothic): no web-font download.
  const fonts = [archivo.variable, dmSans.variable].join(" ");
  return (
    <html lang={lang} className={fonts}>
      <head>
        {/* Browsers that can't decode AVIF get the static tour instead of the fly-through. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var i=new Image();i.onerror=function(){document.documentElement.classList.add('no-avif')};i.onload=function(){if(!i.width)document.documentElement.classList.add('no-avif')};i.src='${AVIF_TEST}'})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
