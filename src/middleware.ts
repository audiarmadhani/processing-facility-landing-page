import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";

// "/" and other un-prefixed paths → /en or /ja based on the browser language.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;

  const accept = req.headers.get("accept-language") ?? "";
  const lang = /^\s*ja\b/i.test(accept) || /(^|,)\s*ja\b[^,]*;q=1/i.test(accept) ? "ja" : defaultLocale;
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|frames|brand|api|favicon|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\.).*)"],
};
