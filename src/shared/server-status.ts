import { z } from "zod";

export const SERVER_STATUS_STALE_MS = 90_000;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const storage = z
  .object({ total: count.positive(), available: count })
  .strict()
  .refine((value) => value.available <= value.total);
const service = {
  reachable: z.boolean(),
  ok: z.boolean(),
  latencyMs: count.nullable(),
};
export const serverReportSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    sampledAt: count,
    uptimeSeconds: count,
    cpu: z
      .object({
        cores: count.positive().max(4096),
        percent: z.number().min(0).max(100).nullable(),
        load: z.tuple([
          z.number().nonnegative(),
          z.number().nonnegative(),
          z.number().nonnegative(),
        ]),
      })
      .strict(),
    memory: storage.nullable(),
    disk: storage.nullable(),
    receiver: z
      .object({
        ...service,
        accounts: count.nullable(),
        connected: count.nullable(),
        links: count.nullable(),
        forwarded: count.nullable(),
        typingSent: count.nullable(),
        typingFailed: count.nullable(),
      })
      .strict(),
    executor: z
      .object({
        ...service,
        draining: z.boolean().nullable(),
        active: count.nullable(),
        completed: count.nullable(),
        failed: count.nullable(),
      })
      .strict(),
  })
  .strict();

export type ServerReport = z.infer<typeof serverReportSchema>;
export type AdminServerStatus = {
  configured: boolean;
  generatedAt: number;
  receivedAt: number | null;
  stale: boolean;
  report: ServerReport | null;
};
