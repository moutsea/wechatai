import { env, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import worker from "../src/server/index";
import * as billing from "../src/server/billing";
import * as auth from "../src/server/auth";

const getSession = vi.fn();
const user = { id: "billing-return-api-user", email: "billing@example.test" };
beforeEach(() => {
  getSession.mockResolvedValue({ user });
  vi.spyOn(auth, "createAuth").mockReturnValue({ api: { getSession } } as unknown as ReturnType<
    typeof auth.createAuth
  >);
  vi.spyOn(billing, "checkout").mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  vi.spyOn(billing, "portal").mockResolvedValue({ url: "https://billing.stripe.com/test" });
});
afterEach(() => vi.restoreAllMocks());
function request(endpoint: string, body?: object) {
  return worker.fetch(
    new Request(`${env.APP_URL}/api/billing/${endpoint}`, {
      method: "POST",
      headers: { origin: env.APP_URL, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    env,
    createExecutionContext(),
  );
}

it("forwards the Korean return path from checkout JSON", async () => {
  expect(
    (await request("checkout", { offerId: "plus_monthly", returnPath: "/ko/app/billing" })).status,
  ).toBe(200);
  expect(vi.mocked(billing.checkout).mock.calls.map((call) => call.slice(1))).toEqual([
    [user, "plus_monthly", "/ko/app/billing"],
  ]);
});
it("forwards the Korean return path from portal JSON", async () => {
  expect((await request("portal", { returnPath: "/ko/app/billing" })).status).toBe(200);
  expect(vi.mocked(billing.portal).mock.calls.map((call) => call.slice(1))).toEqual([
    [user, "/ko/app/billing"],
  ]);
});
it("keeps bodyless portal requests compatible", async () => {
  expect((await request("portal")).status).toBe(200);
  expect(billing.portal).toHaveBeenCalled();
  expect(vi.mocked(billing.portal).mock.calls[0].at(2)).toBeUndefined();
});
it.each(["checkout", "portal"])("requires authentication for localized %s", async (endpoint) => {
  getSession.mockResolvedValue(null);
  expect(
    (await request(endpoint, { offerId: "plus_monthly", returnPath: "/ko/app/billing" })).status,
  ).toBe(401);
  expect(billing.checkout).not.toHaveBeenCalled();
  expect(billing.portal).not.toHaveBeenCalled();
});
