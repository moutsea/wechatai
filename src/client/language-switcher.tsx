import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { DASHBOARD_PATH, LOCALE_DEFINITIONS, localizedPath } from "../shared/i18n";
import { languageCopy as languageCopyKo } from "../shared/i18n/ko/copy/site-header";
import { headerCopy as headerCopyJa } from "../shared/i18n/ja/copy/site-header";
import { languageCopy as languageCopyPt } from "../shared/i18n/pt/copy/site-header";
import { useLocale } from "./locale";

/**
 * One trigger plus a menu of the languages published for this exact page.
 *
 * Public pages load the prerendered document. The dashboard changes locale
 * in place so an open setup flow keeps its step and selected use case.
 */
export function LanguageSwitcher() {
  const { locale, path, alternates } = useLocale();
  const { search, hash } = useLocation();
  const dashboard = path === DASHBOARD_PATH || path.startsWith(`${DASHBOARD_PATH}/`);
  const suffix =
    dashboard || alternates.includes("pt") || alternates.includes("es") ? search + hash : "";
  const [open, setOpen] = useState(false);
  // The menu hangs from the trigger's right edge unless that would cross the
  // viewport's left edge, e.g. when a wrapped header puts the trigger on the left.
  const [alignStart, setAlignStart] = useState(false);
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

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    // Measure from the trigger so the result does not depend on the last alignment.
    setAlignStart(triggerRef.current.getBoundingClientRect().right < menuRef.current.offsetWidth);
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
          ? headerCopyJa.language
          : locale === "pt"
            ? languageCopyPt.navigation
            : locale === "es"
              ? "Idioma"
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
          data-align={alignStart ? "start" : undefined}
          role="menu"
          aria-label={navigation}
          onKeyDown={handleMenuKeyDown}
        >
          {alternates.map((target) => {
            const definition = LOCALE_DEFINITIONS[target];
            const localized =
              locale === "ko"
                ? languageCopyKo.labels[target]
                : locale === "pt"
                  ? languageCopyPt.labels[target]
                  : undefined;
            const href = localizedPath(target, path) + suffix;
            const props = {
              role: "menuitem",
              hrefLang: definition.htmlLang,
              lang: localized ? undefined : definition.htmlLang,
              "aria-current": target === locale ? (true as const) : undefined,
              onClick: () => {
                setOpen(false);
                if (dashboard) triggerRef.current?.focus();
              },
            };
            return dashboard ? (
              <Link key={target} to={href} {...props}>
                {localized ?? definition.label}
              </Link>
            ) : (
              <a key={target} href={href} {...props}>
                {localized ?? definition.label}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}
