import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { LOCALE_DEFINITIONS, localizedPath } from "../shared/i18n";
import { languageCopy as languageCopyKo } from "../shared/i18n/ko/copy/site-header";
import { useLocale } from "./locale";

/**
 * One trigger plus a menu of the languages published for this exact page.
 *
 * Items are real links: switching language reloads the whole document so `lang`,
 * `og:locale` and the prerendered body stay consistent. Renders nothing when the
 * current page has no published translation.
 */
export function LanguageSwitcher() {
  const { locale, path, alternates } = useLocale();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);

  // Close on a press outside the switcher. Pointerdown also covers touch and
  // fires before the link's own click, so selecting an item still navigates.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Opening with a direction key moves focus into the menu after it renders.
  useEffect(() => {
    if (!open || pendingFocus.current === null) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  }, [open]);

  if (!alternates.length) return null;

  const navigation =
    locale === "ko"
      ? languageCopyKo.navigation
      : locale === "en"
        ? "Language"
        : locale === "ja"
          ? "言語"
          : "语言";
  const currentLabel =
    (locale === "ko" ? languageCopyKo.labels[locale] : undefined) ??
    LOCALE_DEFINITIONS[locale].label;

  const openAt = (index: number) => {
    pendingFocus.current = index;
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const last = Math.max(alternates.length - 1, 0);
      const index = event.key === "ArrowDown" ? 0 : last;
      if (open) menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.focus();
      else openAt(index);
      return;
    }
    if (event.key === "Escape" && open) {
      // Keep the first Escape inside the switcher: the mobile drawer listens on
      // window and must stay open when only the language menu is dismissed.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const all = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (!all.length) return;
    const current = all.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next =
      current < 0 ? (delta > 0 ? 0 : all.length - 1) : (current + delta + all.length) % all.length;
    all[next]?.focus();
  };

  return (
    <nav
      ref={rootRef}
      className="site-language"
      aria-label={navigation}
      onBlur={(event) => {
        if (!open) return;
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="site-language-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${navigation}${locale === "en" ? ": " : "："}${currentLabel}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{currentLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className="site-language-menu"
          role="menu"
          aria-label={navigation}
          onKeyDown={handleMenuKeyDown}
        >
          {alternates.map((target) => {
            const definition = LOCALE_DEFINITIONS[target];
            const localized = locale === "ko" ? languageCopyKo.labels[target] : undefined;
            return (
              <a
                key={target}
                role="menuitem"
                href={localizedPath(target, path)}
                hrefLang={definition.htmlLang}
                lang={localized ? undefined : definition.htmlLang}
                aria-current={target === locale ? "true" : undefined}
                onClick={() => setOpen(false)}
              >
                {localized ?? definition.label}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}
