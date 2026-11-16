import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import HeaderShell from "./HeaderShell";

export default function Header({ lang, t, path = "" }: { lang: Locale; t: Dict["nav"]; path?: string }) {
  return (
    <HeaderShell>
      <a href="#register" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-full focus:bg-cream focus:px-4 focus:py-2 focus:text-forest">
        {t.skip}
      </a>
      <div className="flex items-center justify-between px-5 py-4 sm:px-10 lg:px-16">
        <Link href={`/${lang}`} aria-label="HEQA" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/heqa-wordmark.png" alt="HEQA" width={1200} height={343} className="h-6 w-auto sm:h-7" />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <div className="flex rounded-full border border-cream/25 p-0.5 text-xs backdrop-blur-md" role="group" aria-label={t.language}>
            {(["en", "ja"] as const).map((l) => (
              <Link
                key={l}
                href={`/${l}${path}`}
                hrefLang={l}
                aria-current={l === lang ? "true" : undefined}
                className={`rounded-full px-2.5 py-1 transition ${l === lang ? "bg-cream text-forest" : "text-cream/80 hover:text-cream"}`}
              >
                {l === "en" ? "EN" : "日本語"}
              </Link>
            ))}
          </div>
          <a
            href={`/${lang}#register`}
            className="hidden rounded-full bg-cream px-4 py-2 text-sm font-medium text-forest transition hover:bg-white sm:inline-block"
          >
            {t.register}
          </a>
        </nav>
      </div>
    </HeaderShell>
  );
}
