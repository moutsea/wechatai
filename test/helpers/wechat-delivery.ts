import { env, runInDurableObject } from "cloudflare:test";
import { vi } from "vitest";
import { encrypt } from "../../src/server/security";
import type { PersonalAccount } from "../../src/server/personal-account";
import type { WxMessage } from "../../src/server/wechat";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
const credentials = (state: DurableObjectState) =>
  encrypt(
    env,
    JSON.stringify({
      token: "test",
      baseUrl: "https://ilinkai.weixin.qq.com",
      userId: "owner",
      botId: "bot",
    }),
    `${state.id}:wechat`,
  );

export async function useManualAlarms(state: DurableObjectState) {
  // These tests explicitly advance the sender. A real alarm would race that
  // manual poll (production runs it only from non-overlapping alarms).
  // Reinstall on restored objects too: abortAllDurableObjects removes spies.
  if (!vi.isMockFunction(state.storage.setAlarm))
    vi.spyOn(state.storage, "setAlarm").mockResolvedValue(undefined);
  await state.storage.deleteAlarm();
}

export async function deferAutomaticAlarms(state: DurableObjectState) {
  // Preserve scheduled/not-scheduled state for runDurableObjectAlarm(), but keep
  // wall-clock alarms from racing the test's explicit advancement of the sender.
  if (!vi.isMockFunction(state.storage.setAlarm)) {
    const setAlarm = state.storage.setAlarm.bind(state.storage);
    vi.spyOn(state.storage, "setAlarm").mockImplementation((time, options) =>
      setAlarm(Math.max(Number(time), Date.now() + 86400000), options),
    );
  }
  const pending = await state.storage.getAlarm();
  if (pending !== null) await state.storage.setAlarm(pending);
}

export async function connectForManualDelivery(stub: Account) {
  await runInDurableObject(stub, async (_, state) => {
    await useManualAlarms(state);
    const encryptedCredentials = await credentials(state);
    // Match the production connection transition: credentials and connected
    // status become visible together, never a connected but unusable fixture.
    state.storage.sql.exec(
      "INSERT INTO settings VALUES ('connection', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify({
        status: "connected",
        generation: "g1",
        contextToken: "context",
        encryptedCredentials,
      }),
    );
  });
}

// Exercise the actual inbox sender, including its persisted retry/part cursor.
export async function deliverQueuedReplies(
  stub: Account,
  count = 1,
  fail = false,
  options: {
    beforeSendResult?: (account: PersonalAccount) => Promise<void>;
    incoming?: WxMessage[];
    viaAlarm?: boolean;
  } = {},
) {
  const attempts: { id: string; text: string }[] = [];
  const mockErrors: unknown[] = [];
  await runInDurableObject(stub, async (instance, state) => {
    await useManualAlarms(state);
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      try {
        const request = new Request(url, init);
        if (request.url.endsWith("getupdates"))
          return Response.json({ ret: 0, msgs: options.incoming ?? [] });
        if (!request.url.endsWith("sendmessage"))
          throw new Error(`Unexpected delivery endpoint: ${new URL(request.url).pathname}`);
        const body = await request.json<{
          msg: { client_id: string; item_list: { text_item: { text: string } }[] };
        }>();
        attempts.push({ id: body.msg.client_id, text: body.msg.item_list[0].text_item.text });
        await options.beforeSendResult?.(instance);
        return fail ? Response.json({ ret: 1 }, { status: 503 }) : Response.json({ ret: 0 });
      } catch (error) {
        // pollWechat catches transport errors, so rethrow mock/assertion failures
        // outside it as well; otherwise the original failure is hidden.
        mockErrors.push(error);
        throw error;
      }
    });
    try {
      const encryptedCredentials = await credentials(state);
      state.storage.sql.exec(
        "UPDATE settings SET value=json_set(value, '$.encryptedCredentials', ?) WHERE key='connection'",
        encryptedCredentials,
      );
      for (let i = 0; i < count; i++) {
        if (options.viaAlarm) await instance.alarm();
        else
          await (
            instance as unknown as {
              pollWechat(link: string, deadline: number, steps: number): Promise<void>;
            }
          ).pollWechat("default", Date.now() + 5000, 0);
      }
    } finally {
      spy.mockRestore();
    }
  });
  if (mockErrors.length)
    throw new AggregateError(mockErrors, "WeChat delivery mock failed", { cause: mockErrors[0] });
  return attempts;
}
