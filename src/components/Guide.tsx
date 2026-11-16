import type { Dict } from "@/i18n/en";
import Icon from "./Icon";

export default function Guide({ t }: { t: Dict["guide"] }) {
  return (
    <section id="guide" className="on-cream bg-cream text-forest">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-10 sm:py-32 lg:px-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div>
            <p className="eyebrow text-forest/60">{t.eyebrow}</p>
            <h2 className="mt-4 font-display text-[clamp(2.25rem,5vw,4rem)] leading-[0.98] tracking-[-0.02em]">{t.title}</h2>
            <p className="mt-6 max-w-md text-lg text-forest/75">{t.lead}</p>
          </div>
          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {t.items.map((it) => (
              <li key={it.title} className="border-t border-forest/15 pt-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-forest text-cream">
                    <Icon name={it.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <h3 className="font-display text-xl">{it.title}</h3>
                </div>
                <p className="mt-3 leading-relaxed text-forest/75">{it.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
