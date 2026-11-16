# HEQA — Visit the station

Visitor landing page and registration for the HEQA processing station in Singaraja, Bali.

- **`/en`, `/ja`**: scroll-driven drone fly-through of the station, visitor guidelines, and a 3-step registration form.
- **`/en/check-in`**: lightweight page for the QR code at the gate. Pre-registered guests check in with their code; walk-ins register and are checked in immediately.

Built with Next.js 15 (App Router) + Tailwind v4, Supabase for storage, and optional Resend for email. Deployed on Vercel.

## How the fly-through works

Scrubbing a `<video>` on scroll is jerky because browsers can't seek frame-accurately on every scroll tick. Instead:

1. **Build time** (`npm run frames`): ffmpeg samples each clip in `media/footage/` into frames, and sharp encodes them as AVIF:
   - `d/` 1920×1080 desktop frames (~60–120 KB each)
   - `m/` 864×1536 phone frames, a 9:16 crop around `focusX`
   - `p/`, `pm/` tiny previews of every 4th frame
   - `poster-*.webp` for first paint and the reduced-motion fallback

   Output goes to `public/frames/<version>/` and `src/lib/frames-manifest.json`.
2. **In the browser** (`src/components/flythrough/`):
   - `frame-store.ts` loads full frames only in a window around the current position (40 ahead, 16 behind; the window flips with scroll direction) and releases frames that leave it. It keeps at most 6 requests in flight. All previews stay in memory so fast scrolling always has something to draw.
   - `timeline.ts` maps scroll progress to clip/frame or to a transition between clips.
   - `FlyThrough.tsx` draws to a single `<canvas>` with eased smoothing, whip-pan motion-blur transitions between clips, and captions/progress driven directly in the animation loop (no React re-renders).
   - With `prefers-reduced-motion` or no AVIF support, a static chapter grid is shown instead.

## Swapping in the real drone footage

1. Put the clips in `media/footage/` named as in `scripts/clips.config.mjs` (`01-arrival.mp4` … `06-green.mp4`). Edit that file to add, remove or reorder clips, change the sampled `fps`, or set `focusX` (where the phone crop is centred, 0–1).
2. Make sure `src/i18n/en.ts` and `ja.ts` have one chapter per clip, in the same order.
3. Run `npm run frames` (or `npm run frames -- drying` to re-encode one clip), then commit `public/frames` and `src/lib/frames-manifest.json`.

**Footage tips:**
- 4K or 1080p at 24–30 fps, no in-camera effects.
- Slow, steady, continuous moves (push-ins, orbits, fly-overs) with no cuts inside a clip.
- 5–10 s per clip. Longer clips mean more frames to download, so lower `fps` to compensate.
- Keep the subject near the centre so the 9:16 phone crop still works.
- Budget: ~70–120 frames per clip at the default 24 fps is a good balance.

`npm run placeholder-footage` regenerates the stand-in push-in clips from the stills in `media/stills/`.

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

- Chapter copy in `src/i18n/en.ts` describes the process in general terms. Check the claims, e.g. same-day cherry delivery and drying in "days or weeks".
- Visitor rules (shoes, photography, assembly point) and the "2.5 h from the airport" line.
- Japanese copy (`ja.ts`) is a draft and needs a native review.
- Street address / Google Maps link in the footer.
