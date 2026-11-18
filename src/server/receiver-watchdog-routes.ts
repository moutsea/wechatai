import { Hono } from "hono";
import { z } from "zod";
import {
  listWatchdogSessions,
  recoverReceiverSession,
  recordWatchdogHeartbeat,
} from "./receiver-watchdog";
const sessionSchema = z.uuid();
// Mounted behind the receiver's existing operator bearer authentication.
export const watchdogRoutes = new Hono<{ Bindings: Env }>();
watchdogRoutes.get("/sessions", async (c) => {
  const after = c.req.query("after") || "";
  if (after && !sessionSchema.safeParse(after).success)
    return c.json({ error: "invalid_cursor" }, 400);
  return c.json(await listWatchdogSessions(c.env.DB, after));
});
watchdogRoutes.post("/recover/:session", async (c) => {
  const session = sessionSchema.safeParse(c.req.param("session"));
  if (!session.success) return c.json({ error: "invalid_session" }, 400);
  await recoverReceiverSession(c.env, session.data);
  return c.json({ ok: true });
});
watchdogRoutes.post("/heartbeat", async (c) => {
  await recordWatchdogHeartbeat(c.env.DB);
  return c.json({ ok: true });
});
