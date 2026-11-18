import { z } from "zod";

export const executionCompletionSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  lease: z.uuid(),
  result: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: z.unknown() }),
    z.object({
      ok: z.literal(false),
      code: z.string().max(100),
      message: z.string().max(1000),
    }),
  ]),
});
