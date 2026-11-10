/// <reference lib="es2024.promise" />
import { act, lazy, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadErrorBoundary, RouteLoadErrorBoundary } from "../src/client/load-error-boundary";

it("contains a rejected lazy child without removing the surrounding page or recovery link", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container, { onCaughtError: () => {} });
  const { promise, reject } = Promise.withResolvers<{ default: () => null }>();
  const LazyView = lazy(() => promise);
  try {
    await act(async () =>
      root.render(
        <>
          <h1>Account overview</h1>
          <LoadErrorBoundary
            fallback={
              <div role="alert">
                <a href="/app">Open workspace</a>
              </div>
            }
          >
            <Suspense fallback={<span role="status">Loading menu</span>}>
              <LazyView />
            </Suspense>
          </LoadErrorBoundary>
        </>,
      ),
    );
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      reject(new Error("Failed to fetch dynamically imported module"));
    });
    expect(container.querySelector("h1")?.textContent).toBe("Account overview");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"] a')?.getAttribute("href")).toBe("/app");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

describe("route recovery lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container, { onCaughtError: () => {} });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function HistoryControls() {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate(-1)}>Back</button>
        <button onClick={() => navigate(1)}>Forward</button>
      </>
    );
  }

  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (node) => node.textContent === label,
    );
    expect(button).not.toBeUndefined();
    await act(async () => button!.click());
  }

  it("restores a loaded page on back and contains the cached failure on forward", async () => {
    const { promise, reject } = Promise.withResolvers<{ default: () => null }>();
    const BrokenPage = lazy(() => promise);
    await act(async () =>
      root.render(
        <MemoryRouter>
          <HistoryControls />
          <RouteLoadErrorBoundary>
            <Suspense fallback={<span role="status">Loading</span>}>
              <Routes>
                <Route
                  path="/"
                  element={
                    <>
                      <h1>Home</h1>
                      <Link to="/docs">Docs</Link>
                    </>
                  }
                />
                <Route path="/docs" element={<BrokenPage />} />
              </Routes>
            </Suspense>
          </RouteLoadErrorBoundary>
        </MemoryRouter>,
      ),
    );
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/docs"]')!.click());
    await act(async () => {
      reject(new Error("Failed to fetch docs chunk"));
    });
    expect(container.querySelector('main[role="alert"] button')).not.toBeNull();

    await click("Back");
    expect(container.querySelector("h1")?.textContent).toBe("Home");
    expect(container.querySelector('main[role="alert"]')).toBeNull();

    await click("Forward");
    expect(container.querySelector('main[role="alert"] button')).not.toBeNull();
    await click("Back");
    expect(container.querySelector("h1")?.textContent).toBe("Home");
    expect(container.querySelector('main[role="alert"]')).toBeNull();
  });

  it("does not remount healthy shared state when the pathname changes", async () => {
    function StatefulShell() {
      const [count, setCount] = useState(0);
      return (
        <>
          <button onClick={() => setCount((value) => value + 1)}>Increment</button>
          <output>{count}</output>
          <Routes>
            <Route path="/" element={<h1>Home</h1>} />
            <Route path="/other" element={<h1>Other</h1>} />
          </Routes>
        </>
      );
    }
    await act(async () =>
      root.render(
        <MemoryRouter>
          <HistoryControls />
          <Link to="/other">Other page</Link>
          <RouteLoadErrorBoundary>
            <StatefulShell />
          </RouteLoadErrorBoundary>
        </MemoryRouter>,
      ),
    );
    await click("Increment");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/other"]')!.click());
    expect(container.querySelector("h1")?.textContent).toBe("Other");
    expect(container.querySelector("output")?.textContent).toBe("1");
    await click("Back");
    expect(container.querySelector("h1")?.textContent).toBe("Home");
    expect(container.querySelector("output")?.textContent).toBe("1");
  });
});
