/**
 * Selects the marketing dictionary for a locale. Chinese copy still lives next
 * to its components; `undefined` means "use the Chinese source".
 *
 * `Widen` turns the `as const` literal types of a dictionary into the common
 * shape every translation must satisfy, so a new locale cannot silently drift
 * from the source structure.
 */
import type { Locale } from "./index";
import { homeCopy as homeCopyEn } from "./en/copy/home";
import { homeCopy as homeCopyJa } from "./ja/copy/home";
import { homeCopy as homeCopyKo } from "./ko/copy/home";
import { pricingCopy as pricingCopyEn } from "./en/copy/pricing";
import { pricingCopy as pricingCopyJa } from "./ja/copy/pricing";
import { pricingCopy as pricingCopyKo } from "./ko/copy/pricing";

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends (...args: infer A) => infer R
        ? (...args: A) => Widen<R>
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : T extends object
            ? { readonly [K in keyof T]: Widen<T[K]> }
            : T;

export type HomeCopy = Widen<typeof homeCopyEn>;
export type PricingCopy = Widen<typeof pricingCopyEn>;

const homeCopies: Partial<Record<Locale, HomeCopy>> = {
  en: homeCopyEn,
  ja: homeCopyJa,
  ko: homeCopyKo,
};

const pricingCopies: Partial<Record<Locale, PricingCopy>> = {
  en: pricingCopyEn,
  ja: pricingCopyJa,
  ko: pricingCopyKo,
};

export function homeCopyFor(locale: Locale): HomeCopy | undefined {
  return homeCopies[locale];
}

export function pricingCopyFor(locale: Locale): PricingCopy | undefined {
  return pricingCopies[locale];
}
