# HEQA — Visit the station

Visitor landing page and registration for the HEQA processing station in Singaraja, Bali.

- **`/en`, `/ja`**: scroll-driven drone fly-through of the station, visitor guidelines, and a 3-step registration form.
- **`/en/check-in`**: lightweight page for the QR code at the gate. Pre-registered guests check in with their code; walk-ins register and are checked in immediately.

Built with Next.js 15 (App Router) + Tailwind v4, Supabase for storage, and optional Resend for email. Deployed on Vercel.

## How the fly-through works

Scrubbing a `<video>` on scroll is jerky because browsers can't seek frame-accurately on every scroll tick. Instead:

1. **Build time** (`npm run frames`): ffmpeg trims and samples each clip in `media/footage/`, and sharp encodes the frames as AVIF:
   - `d/` 1920×1080 desktop frames, from the 16:9 file
   - `m/` 720×1600 phone frames, from the vertical (20:9) file
   - `p/`, `pm/` tiny previews of every 4th frame
   - `poster-*.webp` for first paint and the reduced-motion fallback

   Output goes to `public/frames/<version>/` and `src/lib/frames-manifest.json`.
2. **In the browser** (`src/components/flythrough/`):
   - `frame-store.ts` loads full frames only in a window around the current position (40 ahead, 16 behind; the window flips with scroll direction) and releases frames that leave it. It keeps at most 6 requests in flight. All previews stay in memory so fast scrolling always has something to draw.
   - `timeline.ts` maps scroll progress to clip/frame or to a transition between clips.
   - `FlyThrough.tsx` draws to a single `<canvas>` with eased smoothing, transitions between clips, and captions/progress driven directly in the animation loop (no React re-renders).
   - **Transitions continue the camera move.** `scripts/analyze-motion.mjs` (run automatically by `npm run frames`, or alone with `npm run motion`) measures each clip's motion (pan direction and push-in/pull-back) at its start and end, separately for the desktop and phone versions, and stores it in the manifest. The outgoing shot carries on its own move, accelerating into a true motion blur (sideways streaks for pans, radial for zooms). The next shot arrives moving the same way and settles. If a shot ends almost still, the direction comes from how the next shot starts. Exposed edges are filled with mirrored copies, so there's no artificial zoom. Tuning constants (`TRAVEL`, `ZOOM_TRAVEL`, `SHUTTER`) are at the top of `FlyThrough.tsx`.
   - `snap.ts` adds chapter snapping. A quick swipe (or a single mouse-wheel notch) glides to the next chapter's stop, where its caption is fully in view: one chapter per swipe. Continuous scrolling (a slow or long drag, trackpad, a spinning wheel) is left free and stops wherever the user stops. Any new touch, wheel or key input cancels a glide. Stops are the hero, each chapter, and the section after the fly-through; below that, scrolling is normal. Thresholds are at the top of `snap.ts`.
     On touch devices, scrolling inside the fly-through is driven by the page itself (it follows the finger, then glides or coasts with its own momentum), because iOS Safari's native momentum can't be cancelled and would overshoot the stops. A side effect: Safari's toolbar doesn't shrink while you drag inside the fly-through.
   - With `prefers-reduced-motion` or no AVIF support, a static chapter grid is shown instead.

## Footage

The footage lives in the HEQA Google Drive. The `16:9` folder has the landscape versions and the `20:9` folder has the vertical versions. Up to #15 the two folders' numbers match; from #16 on, the vertical folder is numbered one lower (vertical #16 = landscape #17 … vertical #30 = landscape #31), and landscape #16 has no vertical version. The site uses these nine, in this order:

| Chapter | Landscape # | Vertical # | Trim |
|---|---|---|---|
| highlands (hero) | 6 | 6 | 0–6 s |
| intake | 30 | 29 | 5.5–12.8 s |
| pulping | 20 | 19 | 0–3 s |
| fermentation (the tank) | 18 | 17 | 0–5 s |
| control | 27 | 26 | 0.3–4.2 s |
| drying-houses | 1 | 1 | 6–16.8 s |
| drying-room | 17 | 16 | full (2.3 s) |
| dry-mill (huller outlet) | 15 | 15 | full (2.4 s) |
| station | 5 | 5 | 1–14.9 s |

The still beside the registration form (`public/images/team.webp`) is from landscape #10.

To change clips:

1. Download them into `media/footage/` (not committed, ~500 MB) using the names in `scripts/clips.config.mjs`. That file also holds each clip's trim and sampled `fps`; aim for ~90–110 frames per clip.
2. Keep one chapter per clip, in the same order, in `src/i18n/en.ts` and `ja.ts`.
3. Run `npm run frames` (or `npm run frames -- patio` to re-encode one clip). A full run takes roughly 30–40 minutes.
4. Commit `public/frames` and `src/lib/frames-manifest.json`.

## Data

Visitor records are stored in the existing **Platform Database** Supabase project, in a separate `visitors` schema that is not exposed through the API (see `supabase/migrations/`):

- `visitors.visits`: one row per visit. RLS is on with no policies.
- `visitors.today`: today's visitors (Bali time) for reception.
- `public.heqa_register_visit(p jsonb, p_ip_hash text)` and `public.heqa_check_in(ref, email)`: the only entry points. These are SECURITY DEFINER functions that validate input and are rate limited (8 per IP per 10 min; 30 per minute globally).

The site uses only the **publishable** key, server-side. To view visitors, open the Supabase dashboard → Table editor → schema `visitors`, or run SQL:

```sql
select * from visitors.today;
```

Retention: the copy promises records are kept for at most 12 months. Schedule a cleanup, for example with `pg_cron`:

```sql
delete from visitors.visits where visit_date < now() - interval '12 months';
```

## Environment variables

See `.env.example`. On Vercel, set them under Project → Settings → Environment Variables.

| Name | Required | |
|---|---|---|
| `SUPABASE_URL` | yes | |
| `SUPABASE_PUBLISHABLE_KEY` | yes | `sb_publishable_…` |
| `IP_HASH_SALT` | yes | Random string; IPs are hashed, never stored |
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical URL, used for metadata |
| `RESEND_API_KEY`, `MAIL_FROM` | no | Enables confirmation emails |
| `VISIT_NOTIFY_EMAIL` | no | Comma-separated staff addresses notified of each visit and arrival |

## Develop

```bash
npm install
npm run dev
```

## Before launch: content to confirm

- Chapter copy in `src/i18n/en.ts`: check the claims, e.g. Kintamani highlands, the fermentation tanks, a calibrated/monitored line, racked drying rooms, and what the pulpers do.
- Visitor rules (shoes, photography, assembly point) and the "2.5 h from the airport" line.
- Japanese copy (`ja.ts`) is a draft and needs a native review.
- Street address / Google Maps link in the footer.
