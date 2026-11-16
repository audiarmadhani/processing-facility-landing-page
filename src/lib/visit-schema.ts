import { z } from "zod";

// Error messages are keys into dict.form.errors so the client can translate them.
export const PURPOSES = ["buyer", "cupping", "tour", "producer", "supplier", "research", "media", "other"] as const;
export const ARRIVALS = ["morning", "midday", "afternoon", "unsure"] as const;

/** Today's date in Bali (WITA, UTC+8) as YYYY-MM-DD. */
export const baliToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

const mustAccept = z.literal(true, { error: "ack" });
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const visitSchema = z
  .object({
    mode: z.enum(["pre_registered", "walk_in"]),
    full_name: z.string().trim().min(2, "required").max(120),
    company: optionalText(160),
    email: z.string().trim().email("email").max(200),
    phone: z.string().trim().regex(/^\+?[\d\s().-]{6,30}$/, "phone"),
    country: optionalText(80),
    visit_date: z.string().optional(),
    arrival_time: z.enum(ARRIVALS).optional().or(z.literal("")),
    party_size: z.coerce.number().int().min(1, "required").max(40),
    companions: optionalText(1000),
    host_name: optionalText(120),
    purpose: z.enum(PURPOSES, { error: "required" }),
    vehicle_plate: optionalText(30),
    notes: optionalText(2000),
    ack_safety: mustAccept,
    ack_hygiene: mustAccept,
    ack_photo: mustAccept,
    health_ok: mustAccept,
    consent_data: mustAccept,
    marketing_ok: z.boolean().optional(),
    language: z.enum(["en", "ja"]),
    website: z.string().max(0).optional(), // honeypot
  })
  .refine((v) => v.mode === "walk_in" || (!!v.visit_date && v.visit_date >= baliToday()), {
    path: ["visit_date"],
    message: "date",
  });

export type VisitInput = z.input<typeof visitSchema>;
export type Visit = z.output<typeof visitSchema>;

export const STEP_FIELDS: (keyof VisitInput)[][] = [
  ["full_name", "company", "email", "phone", "country"],
  ["visit_date", "arrival_time", "party_size", "companions", "host_name", "purpose", "vehicle_plate", "notes"],
  ["ack_safety", "ack_hygiene", "ack_photo", "health_ok", "consent_data", "marketing_ok"],
];
