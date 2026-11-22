import { expect, test } from "@playwright/test";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  emailLinkPage,
  emailLinkPath,
  privateEmailLink,
  emailActionRequest,
  privateAuthResponse,
} from "../../src/server/auth-email-link";

test("an email click keeps the credential out of all HTTP request URLs", async ({ page }) => {
  const token = "browser-fixture-secret";
  const requests: string[] = [];
  let actionUrl: string | undefined;
  const referrers: string[] = [];
  const server = createServer(async (req, res) => {
    const path = req.url!;
    requests.push(path);
    referrers.push(req.headers.referer ?? "");
    const origin = "http://" + req.headers.host;
    let response: Response;
    if (path === emailLinkPath && req.method === "GET") response = emailLinkPage();
    else if (path === emailLinkPath && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const action = await emailActionRequest(
        new Request(origin + path, {
          method: "POST",
          headers: {
            origin: req.headers.origin ?? "",
            "content-type": req.headers["content-type"] ?? "",
          },
          body: Buffer.concat(chunks).toString(),
        }),
        origin,
      );
      actionUrl = action?.url;
      response = action
        ? privateAuthResponse(Response.redirect(origin + "/reset-password?token=" + token), action)
        : new Response("invalid form", { status: 400 });
    } else
      response = new Response("设置新密码", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    const target = new URL("/api/auth/reset-password/" + token, origin);
    await page.goto(privateEmailLink(target));
    await expect(page).toHaveURL(origin + "/reset-password#token=" + token);
    await expect(page.getByText("设置新密码")).toBeVisible();
    expect(actionUrl).toBe(target.href);
    expect(requests.filter((path) => path === emailLinkPath)).toHaveLength(2);
    expect([...requests, ...referrers].every((value) => !value.includes(token))).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
