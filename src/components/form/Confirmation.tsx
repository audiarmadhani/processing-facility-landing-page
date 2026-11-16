"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { RegisterResult } from "@/app/actions";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/en";
import Icon from "../Icon";

type Props = {
  t: Dict["done"];
  result: Extract<RegisterResult, { ok: true }>;
  lang: Locale;
  onAnother?: () => void;
};

const qrPayload = (ref: string) => `HEQA-VISIT:${ref}`;

function formatDate(iso: string, lang: Locale) {
  const d = new Date(`${iso}T12:00:00+08:00`);
  return d.toLocaleDateString(lang === "ja" ? "ja-JP" : "en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

export default function Confirmation({ t, result, lang, onAnother }: Props) {
  const [qr, setQr] = useState<string>("");
  const checkedIn = result.status === "checked_in";

  useEffect(() => {
    QRCode.toDataURL(qrPayload(result.ref), { margin: 0, width: 480, color: { dark: "#00291b", light: "#00000000" } }).then(setQr);
  }, [result.ref]);

  // Renders a phone-sized pass and downloads it, so guests can show it offline.
  const savePass = async () => {
    const W = 1080, H = 1600;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#00291b";
    ctx.fillRect(0, 0, W, H);
    const logo = new Image();
    logo.src = "/brand/heqa-wordmark.png";
    await logo.decode();
    ctx.drawImage(logo, 90, 110, 360, (360 * logo.height) / logo.width);
    ctx.fillStyle = "#f5e8df";
    ctx.beginPath();
    ctx.roundRect(90, 300, W - 180, 1180, 48);
    ctx.fill();
    const qrImg = new Image();
    qrImg.src = await QRCode.toDataURL(qrPayload(result.ref), { margin: 0, width: 600, color: { dark: "#00291b", light: "#f5e8df" } });
    await qrImg.decode();
    ctx.drawImage(qrImg, (W - 600) / 2, 400, 600, 600);
    ctx.fillStyle = "#00291b";
    ctx.textAlign = "center";
    ctx.font = "500 34px system-ui, sans-serif";
    ctx.fillText(t.code.toUpperCase(), W / 2, 1110);
    ctx.font = "600 110px system-ui, sans-serif";
    ctx.fillText(result.ref, W / 2, 1230);
    ctx.font = "400 40px system-ui, sans-serif";
    ctx.fillText(formatDate(result.visitDate, lang), W / 2, 1320);
    ctx.fillText(result.firstName, W / 2, 1385);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `HEQA-${result.ref}.png`;
    a.click();
  };

  return (
    <div className="on-cream overflow-hidden rounded-[1.75rem] bg-cream text-forest shadow-2xl shadow-black/30" role="status">
      <div className="flex items-center gap-3 bg-forest px-6 py-5 text-cream sm:px-8">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-cream text-forest">
          <Icon name="check" className="h-5 w-5" />
        </span>
        <h3 className="font-display text-2xl">{checkedIn ? t.titleCheckedIn : t.title}</h3>
      </div>
      <div className="grid gap-8 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div>
          <p className="text-forest/75">{checkedIn ? t.leadCheckedIn.replace("{name}", result.firstName) : t.lead}</p>
          <p className="eyebrow mt-6 text-forest/55">{t.code}</p>
          <p className="mt-1 font-display text-5xl tracking-[0.04em] tabular-nums sm:text-6xl">{result.ref}</p>
          <p className="mt-4 text-forest/75">
            {t.date}: <span className="font-medium text-forest">{formatDate(result.visitDate, lang)}</span>
          </p>
          {result.emailed && <p className="mt-2 text-sm text-forest/55">{t.emailNote}</p>}
        </div>
        <div className="mx-auto w-44 sm:w-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt={`QR ${result.ref}`} className="aspect-square w-full" /> : <div className="aspect-square w-full animate-pulse rounded-xl bg-forest/10" />}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-forest/10 p-6 sm:px-8">
        <button onClick={savePass} className="rounded-full bg-forest px-5 py-3 text-sm font-medium text-cream transition hover:bg-forest-soft">
          {t.save}
        </button>
        {onAnother && (
          <button onClick={onAnother} className="rounded-full px-5 py-3 text-sm text-forest/70 ring-1 ring-forest/20 transition hover:text-forest hover:ring-forest/40">
            {t.another}
          </button>
        )}
      </div>
    </div>
  );
}
