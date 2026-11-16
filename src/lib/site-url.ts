// Canonical site URL. Accepts "example.com" or "https://example.com";
// falls back to Vercel's production domain, then localhost.
export function siteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "localhost:3000";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `${raw.startsWith("localhost") ? "http" : "https"}://${raw}`;
  try {
    return new URL(withScheme);
  } catch {
    return new URL("http://localhost:3000");
  }
}
