"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getDict } from "@/i18n/config";
import { esc, sendMail } from "@/lib/email";
import { rpc } from "@/lib/supabase-rpc";
import { visitSchema, type VisitInput } from "@/lib/visit-schema";

export type RegisterResult =
  | { ok: true; ref: string; visitDate: string; status: string; firstName: string; emailed: boolean }
  | { ok: false; error: string; fields?: Record<string, string> };

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!ip) return null;
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

export async function registerVisit(input: VisitInput): Promise<RegisterResult> {
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { ok: false, error: "generic", fields };
  }
  const v = parsed.data;
  if (v.website) return { ok: false, error: "generic" }; // bot

  const payload = { ...v, website: undefined };
  try {
    const [row] = await rpc<{ ref: string; visit_date: string; status: string }[]>("heqa_register_visit", {
      p: payload,
      p_ip_hash: await ipHash(),
    });
    const t = getDict(v.language);
    const firstName = v.full_name.split(/\s+/)[0];
    const purpose = t.form.purposes[v.purpose];
    const walkIn = v.mode === "walk_in";

    const guestHtml = `
      <div style="font-family:Arial,sans-serif;color:#00291b;max-width:520px">
        <p style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#557">HEQA</p>
        <h1 style="font-weight:500">${esc(walkIn ? t.done.titleCheckedIn : t.done.title)}</h1>
        <p>${esc(t.done.lead)}</p>
        <p style="font-size:32px;letter-spacing:.08em;font-weight:600;margin:24px 0">${esc(row.ref)}</p>
        <p>${esc(t.done.date)}: <b>${esc(row.visit_date)}</b><br>${esc(t.form.fields.purpose)}: ${esc(purpose)}</p>
        <p style="color:#557;font-size:13px">${esc(t.footer.station)} · ${esc(t.footer.address)}</p>
      </div>`;
    const staffHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>${walkIn ? "Walk-in checked in" : "New visit registered"}: ${esc(row.ref)}</h2>
        <table cellpadding="4">
          ${[
            ["Name", v.full_name], ["Company", v.company], ["Date", row.visit_date], ["Arrival", v.arrival_time],
            ["People", v.party_size], ["Companions", v.companions], ["Visiting", v.host_name], ["Purpose", purpose],
            ["Phone", v.phone], ["Email", v.email], ["Vehicle", v.vehicle_plate], ["Notes", v.notes], ["Language", v.language],
          ].filter(([, x]) => x).map(([k, x]) => `<tr><td style="color:#777">${k}</td><td>${esc(x)}</td></tr>`).join("")}
        </table>
      </div>`;

    const notify = process.env.VISIT_NOTIFY_EMAIL;
    const [emailed] = await Promise.all([
      sendMail(v.email, `${t.done.code}: ${row.ref} — HEQA`, guestHtml),
      notify ? sendMail(notify.split(","), `[Visit] ${row.ref} · ${v.full_name} · ${row.visit_date}`, staffHtml) : Promise.resolve(false),
    ]);
    return { ok: true, ref: row.ref, visitDate: row.visit_date, status: row.status, firstName, emailed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "generic" };
  }
}

export async function checkIn(ref: string, email: string): Promise<RegisterResult> {
  if (!/^HQ-?[A-Z0-9]{6}$/i.test(ref.trim()) || !email.includes("@")) return { ok: false, error: "not_found" };
  const normRef = ref.trim().toUpperCase().replace(/^HQ-?/, "HQ-");
  try {
    const [row] = await rpc<{ ref: string; full_name: string; status: string; visit_date: string }[]>("heqa_check_in", {
      p_ref: normRef,
      p_email: email,
    });
    const notify = process.env.VISIT_NOTIFY_EMAIL;
    if (notify) await sendMail(notify.split(","), `[Arrived] ${row.ref} · ${row.full_name}`, `<p>${esc(row.full_name)} (${esc(row.ref)}) has checked in at the gate.</p>`);
    return { ok: true, ref: row.ref, visitDate: row.visit_date, status: row.status, firstName: row.full_name, emailed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "generic" };
  }
}
