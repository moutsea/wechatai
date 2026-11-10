import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ElementAddress = { id: string; children: number[]; tagName: string };

/** Locate a static element within its nearest named section after React replaces the DOM. */
function addressOf(element: Element, root: HTMLElement): ElementAddress {
  const children: number[] = [];
  let ancestor = element;
  while (ancestor !== root && !ancestor.id && ancestor.parentElement) {
    children.unshift(Array.from(ancestor.parentElement.children).indexOf(ancestor));
    ancestor = ancestor.parentElement;
  }
  return { id: ancestor.id, children, tagName: element.tagName };
}

function findElement(address: ElementAddress, root: HTMLElement): Element | null {
  let element: Element | null = document.getElementById(address.id);
  if (!element || !root.contains(element)) return null;
  for (const index of address.children) {
    element = element.children.item(index);
    if (!element) return null;
  }
  return element.tagName === address.tagName ? element : null;
}

/** Hit testing also excludes content clipped by a scroller or covered by a sticky header. */
function hasVisibleFocus(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return (
    right > left &&
    bottom > top &&
    element.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
  );
}

export function captureDocumentState(root: HTMLElement) {
  const active = document.activeElement;
  const focused = active && root.contains(active) ? active : null;
  // A filtered-out target returns to its owning search field, never a positional sibling.
  const fallbackId = focused
    ?.closest("[data-handoff-focus-fallback]")
    ?.getAttribute("data-handoff-focus-fallback");
  const fallback = fallbackId ? document.getElementById(fallbackId) : null;
  return {
    x: window.scrollX,
    y: window.scrollY,
    scrolls: Array.from(root.querySelectorAll<HTMLElement>("*"))
      .filter((element) => element.scrollLeft !== 0 || element.scrollTop !== 0)
      .map((element) => ({
        address: addressOf(element, root),
        x: element.scrollLeft,
        y: element.scrollTop,
      })),
    details: Array.from(root.querySelectorAll("details"), (element) => ({
      address: addressOf(element, root),
      open: element.open,
    })),
    // Public controlled inputs use stable IDs so their first render can adopt typed values.
    inputs: new Map(
      Array.from(root.querySelectorAll<HTMLInputElement>("input[id]"), (element) => [
        element.id,
        element.value,
      ]),
    ),
    focus: focused ? addressOf(focused, root) : null,
    focusFallback: fallback && root.contains(fallback) ? addressOf(fallback, root) : null,
    focusWasVisible: focused ? hasVisibleFocus(focused) : false,
    selection:
      focused instanceof HTMLInputElement && focused.selectionStart !== null
        ? {
            start: focused.selectionStart,
            end: focused.selectionEnd!,
            direction: focused.selectionDirection!,
          }
        : null,
  };
}

export type DocumentState = ReturnType<typeof captureDocumentState>;

const InitialInputs = createContext<ReadonlyMap<string, string> | null>(null);

export function DocumentInputProvider({
  initialDocument,
  children,
}: {
  initialDocument?: DocumentState;
  children: ReactNode;
}) {
  const [inputs, setInputs] = useState(() => initialDocument?.inputs ?? null);
  // Only the initial commit adopts the static document. Later mounts start with normal defaults.
  useEffect(() => setInputs(null), []);
  return <InitialInputs.Provider value={inputs}>{children}</InitialInputs.Provider>;
}

export function useDocumentInputs() {
  return useContext(InitialInputs);
}

/** Restore native reading interactions before paint, then restore the viewport without animation. */
export function restoreDocumentState(root: HTMLElement, state: DocumentState) {
  for (const { address, open } of state.details) {
    const element = findElement(address, root);
    if (element instanceof HTMLDetailsElement) element.open = open;
  }
  for (const { address, x, y } of state.scrolls) {
    const element = findElement(address, root);
    if (element instanceof HTMLElement) {
      element.scrollTo({ left: x, top: y, behavior: "instant" });
    }
  }
  const focused =
    (state.focus && findElement(state.focus, root)) ??
    (state.focusFallback && findElement(state.focusFallback, root));
  if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  if (focused instanceof HTMLInputElement && state.selection) {
    focused.setSelectionRange(
      state.selection.start,
      state.selection.end,
      state.selection.direction,
    );
  }
  window.scrollTo({ left: state.x, top: state.y, behavior: "instant" });
  // Preserve reading position if the user had already scrolled away from the focused control.
  // Otherwise reveal a moved/replaced target after restoring all saved scroll positions.
  if (focused instanceof HTMLElement && state.focusWasVisible && !hasVisibleFocus(focused)) {
    focused.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }
}
