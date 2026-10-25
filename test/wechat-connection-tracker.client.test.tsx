import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../src/client/context";
import { Wechat } from "../src/client/pages/wechat";
import { useWechatConnectionTracker } from "../src/client/wechat-connection-tracker";
import { createDemo } from "../src/client/demo";
import type { Connection, Snapshot, WechatLink } from "../src/shared/types";

const auth = vi.hoisted(() => ({ refetch: vi.fn(async () => {}) }));
vi.mock("../src/client/auth", () => ({ useAuth: () => ({ data: null, refetch: auth.refetch }) }));
let root: Root;
let container: HTMLDivElement;
let snapshot: Snapshot;
let events: string[];

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  snapshot = await createDemo()<Snapshot>("/dashboard");
  window.history.replaceState({}, "", "/app/wechat");
  events = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/api/dashboard") return Response.json(snapshot);
      if (path === "/api/analytics/event") {
        events.push(JSON.parse(String(options?.body)).name);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected API: ${path}`);
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Views() {
  const { refresh } = useApp();
  return (
    <>
      <button onClick={() => void refresh()}>refresh</button>
      <Link to="/app">away</Link>
      <Link to="/app/wechat">wechat</Link>
      <Routes>
        <Route path="/app" element={<p>Other workspace page</p>} />
        <Route path="/app/wechat" element={<Wechat />} />
      </Routes>
    </>
  );
}
async function mount(key = "live") {
  await act(async () =>
    root.render(
      <MemoryRouter key={key} initialEntries={["/app/wechat"]}>
        <AppProvider demo={false}>
          <Views />
        </AppProvider>
      </MemoryRouter>,
    ),
  );
}
function links(
  statuses: Record<string, Connection["status"]>,
  selected = Object.keys(statuses)[0],
  paused = false,
) {
  snapshot.connections = Object.entries(statuses).map(([id, status]): WechatLink => ({
    id,
    status,
    name: id,
    paused,
    createdAt: 1,
    currentSessionId: "",
    botId: id,
  }));
  snapshot.selectedConnectionId = selected;
  snapshot.connection = snapshot.connections.find((link) => link.id === selected)!;
}
async function click(label: string) {
  const element = [...container.querySelectorAll<HTMLElement>("a,button")].find(
    (item) => item.textContent === label,
  );
  expect(element).toBeDefined();
  await act(async () => element!.click());
}

describe("workspace WeChat connection events", () => {
  it("does not report an existing connection on initial load, remount, refresh or page revisit", async () => {
    links({ a: "connected" });
    await mount();
    await click("refresh");
    await click("away");
    await click("wechat");
    await mount("new-workspace");
    expect(events).toEqual([]);
  });

  it("reports scanned-to-connected once, even away from the WeChat page, and allows a real reconnect", async () => {
    links({ a: "waiting" });
    await mount();
    await click("away");
    links({ a: "scanned" });
    await click("refresh");
    expect(events).toEqual([]);
    links({ a: "connected" });
    await click("refresh");
    await click("refresh");
    await click("wechat");
    expect(events).toEqual(["wechat_connected"]);
    links({ a: "waiting" });
    await click("refresh");
    links({ a: "connected" });
    await click("refresh");
    expect(events).toEqual(["wechat_connected", "wechat_connected"]);
  });

  it("does not mistake a selected-link change, an already-connected new link or unpausing for a connection", async () => {
    links({ a: "disconnected", b: "connected" }, "a");
    await mount();
    links({ a: "disconnected", b: "connected" }, "b");
    await click("refresh");
    links({ a: "disconnected", b: "connected", c: "connected" }, "c", true);
    await click("refresh");
    links({ a: "disconnected", b: "connected", c: "connected" }, "c");
    await click("refresh");
    expect(events).toEqual([]);
  });

  it("tracks pending links independently of the selected link", async () => {
    links({ a: "waiting", b: "connected" }, "b");
    await mount();
    links({ a: "connected", b: "connected" }, "b");
    await click("refresh");
    expect(events).toEqual(["wechat_connected"]);
  });

  it("never emits for demo transitions or for a fresh baseline after leaving demo mode", async () => {
    function Probe({ demo }: { demo: boolean }) {
      useWechatConnectionTracker(structuredClone(snapshot), demo);
      return null;
    }
    links({ a: "waiting" });
    await act(async () => root.render(<Probe demo />));
    links({ a: "connected" });
    await act(async () => root.render(<Probe demo />));
    await act(async () => root.render(<Probe demo={false} />));
    expect(events).toEqual([]);
  });
});
