import type { Dict } from "@/i18n/en";

export default function Footer({ t }: { t: Dict["footer"] }) {
  return (
    <footer className="bg-forest-deep text-cream">
      <div className="mx-auto max-w-7xl px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-16 sm:px-10 lg:px-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/heqa-wordmark.png" alt="HEQA" width={1200} height={343} className="h-auto w-full max-w-[min(100%,56rem)] opacity-95" />
        <div className="mt-12 grid gap-8 border-t border-cream/15 pt-8 text-sm text-cream/70 sm:grid-cols-3">
          <div>
            <p className="font-display text-cream">{t.station}</p>
            <p className="mt-1">{t.address}</p>
          </div>
          <div>
            <p className="font-display text-cream">{t.reception}</p>
            <p className="mt-1">
              <a className="underline-offset-4 hover:underline" href="mailto:info@heqa.coffee">info@heqa.coffee</a>
              <br />
              <a className="underline-offset-4 hover:underline" href="https://wa.me/31628794601">WhatsApp</a>
              {" · "}
              <a className="underline-offset-4 hover:underline" href="https://www.instagram.com/heqacoffee">Instagram</a>
              {" · "}
              <a className="underline-offset-4 hover:underline" href="https://www.heqa.coffee">heqa.coffee</a>
            </p>
          </div>
          <div>
            <p>{t.privacy}</p>
            <p className="mt-3 text-cream/50">{t.family}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
