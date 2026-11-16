import en from "./en";
import ja from "./ja";

export const locales = ["en", "ja"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

const dictionaries = { en, ja };
export const getDict = (lang: Locale) => dictionaries[lang];
export const isLocale = (v: string): v is Locale => (locales as readonly string[]).includes(v);
