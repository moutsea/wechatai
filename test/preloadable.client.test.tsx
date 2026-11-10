import { act, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { preloadable } from "../src/client/preloadable";

it("keeps page state when the parent updates after a deferred load", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  function Form({ label }: { label: string }) {
    const [count, setCount] = useState(0);
    return (
      <button onClick={() => setCount((value) => value + 1)}>
        {label}: {count}
      </button>
    );
  }
  let resolve!: (module: { default: typeof Form }) => void;
  const Page = preloadable(
    () =>
      new Promise<{ default: typeof Form }>((done) => {
        resolve = done;
      }),
  );
  const render = (label: string) =>
    root.render(
      <Suspense fallback={<p>Loading</p>}>
        <Page label={label} />
      </Suspense>,
    );
  try {
    await act(async () => render("Before"));
    expect(container.textContent).toBe("Loading");
    await act(async () => resolve({ default: Form }));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("Before: 1");
    await act(async () => render("After"));
    expect(container.textContent).toBe("After: 1");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
