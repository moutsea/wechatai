import { afterEach, expect, it, vi } from "vitest";
import {
  billingReturnPath,
  clearBillingReturn,
  rememberBillingReturn,
} from "../src/client/billing-return";

const email = "billing@example.test";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

it.each(["/app", "/pt/app", "/ko/app"])("restores an exact %s billing destination", (base) => {
  rememberBillingReturn(email, base);
  expect(billingReturnPath(email)).toBe(`${base}/billing`);
  // Reads are repeatable while routing, including React StrictMode renders.
  expect(billingReturnPath(email)).toBe(`${base}/billing`);
  clearBillingReturn(email);
  expect(billingReturnPath(email)).toBeNull();
});

it("isolates return intent by account and replaces the previous departure intent", () => {
  rememberBillingReturn(email, "/pt/app");
  expect(billingReturnPath("other@example.test")).toBeNull();
  rememberBillingReturn(email, "/app");
  expect(billingReturnPath(email)).toBe("/app/billing");
});

it("rejects tampered storage, external destinations and unsupported workspace routes", () => {
  for (const base of [
    "https://evil.example/pt/app",
    "//evil.example/pt/app",
    "/\\evil.example/pt/app",
    "/pt/app/../../login",
    "/pt/app?returnTo=https://evil.example",
    "/pt/app#other",
    "/pt/app/%2e%2e",
    "/pt/app/..%5c..",
    "/pt/app/plugins",
    "/en/app",
    "{}",
  ]) {
    sessionStorage.setItem(`wechatai:billing-return:${email}`, base);
    expect(billingReturnPath(email), base).toBeNull();
  }
});

it("keeps the canonical billing page available when browser storage is unavailable", () => {
  for (const method of ["getItem", "setItem", "removeItem"] as const)
    vi.spyOn(sessionStorage, method).mockImplementation(() => {
      throw new Error("Storage is unavailable");
    });
  expect(() => rememberBillingReturn(email, "/pt/app")).not.toThrow();
  expect(billingReturnPath(email)).toBeNull();
  expect(() => clearBillingReturn(email)).not.toThrow();
});
