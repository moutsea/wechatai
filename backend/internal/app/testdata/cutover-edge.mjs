// This diagnostic route and its local D1 table exist only inside the rehearsal.
import { createHmac } from "node:crypto";
import publicWorker from "../../../../src/server/index";
import {
  CLOUD_CALLBACK_PATH,
  createCloudCallbackToken,
  cloudCallbackSecret,
} from "../../../../src/server/cloud-agent-callback";
import { PersonalAccount as SourceAccount } from "../../../../src/server/personal-account";
import {
  applyAccountPayment,
  accountForAdmin,
  accountForReferral,
  accountForNotification,
  accountForUser,
  receiverConnection,
  receiverStatus,
} from "../../../../src/server/account-route";
import { parseOpenClawPairing, parseOpenClawToken } from "../../../../src/server/openclaw-token";
import { callBackend } from "../../../../src/server/backend-client";
import {
  notificationTokenHash,
  parseNotificationToken,
} from "../../../../src/server/notification-token";
import { encrypt } from "../../../../src/server/security";

// Only the rehearsal adds fixture data. Both RPCs under comparison are the
// inherited production implementations.
const notifyId = "20000000-0000-4000-8000-000000000000";
const cloudId = (n) => "10000000-0000-4000-8000-" + String(n).padStart(12, "0");
const assetIds = Array.from({ length: 6 }, (_, i) => "00000000-0000-0000-0000-00000000000" + i);
export class PersonalAccount extends SourceAccount {
  referralEntries() {
    return this.ctx.storage.sql
      .exec(
        "SELECT b.id,b.remaining,b.expires,l.amount,l.note FROM credit_buckets b JOIN credit_ledger l ON l.id='grant:'||b.id WHERE b.kind='referral' ORDER BY b.id",
      )
      .toArray();
  }
  async seedComparison() {
    const encryptedCredentials = await encrypt(
      this.env,
      JSON.stringify({ userId: "fixture-微信-id" }),
      this.ctx.id + ":wechat",
    );
    const now = Date.now() - 60000;
    const sql = this.ctx.storage.sql;
    for (const [i, id] of assetIds.entries()) {
      sql.exec(
        "INSERT INTO output_assets(id,runId,mime,bytes,width,height,expiresAt,committed,name) VALUES(?,?,?,?,?,?,?,?,?)",
        id,
        "run",
        i === 1 ? "text/plain; charset=utf-8" : "image/jpeg",
        7,
        1,
        1,
        now + (i === 2 ? 0 : 86400000),
        i === 3 ? 0 : i === 4 ? -1 : 1,
        i === 1 ? "我的'文件.txt" : "",
      );
      if (i !== 5) await this.env.MEDIA.put("generated/" + this.ctx.id + "/" + id, "from R2");
    }
    this.ctx.storage.transactionSync(() => {
      sql.exec("INSERT INTO wechat_links VALUES(?,?,?)", "comparison", "测试微信", 1);
      sql.exec(
        "INSERT INTO settings VALUES(?,?)",
        "wechat:comparison:connection",
        JSON.stringify({ status: "disconnected", encryptedCredentials }),
      );
      sql.exec("INSERT INTO settings VALUES(?,?)", "deliveredWechatReplies", "2");
      sql.exec(
        "INSERT INTO notification_tokens VALUES(?,?)",
        "fixture-plugin",
        notificationTokenHash("fixture-credential"),
      );
      const plugin = {
        id: "claw",
        name: "我的连接",
        shortcut: "claw",
        pluginId: "wechatai/openclaw",
        enabled: true,
      };
      sql.exec("INSERT INTO plugins VALUES(?,?)", plugin.id, JSON.stringify(plugin));
      sql.exec(
        "INSERT INTO claw_connectors(pluginId,tokenHash,connectorVersion) VALUES(?,?,?)",
        plugin.id,
        "fixture",
        "1.0.0",
      );
      sql.exec("INSERT INTO settings VALUES('dashboardOnboardingDismissedAt','123456')");
      sql.exec(
        "INSERT INTO settings VALUES('planUntil',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        JSON.stringify(now + 86400000),
      );
      sql.exec(
        "INSERT INTO plugins VALUES(?,?)",
        "role",
        JSON.stringify({ id: "role", pluginId: "wechatai/roleplay", enabled: true }),
      );
      for (const session of [
        { id: "history", pluginInstanceId: "role", contextStart: 4, resetAt: 7, updatedAt: 20 },
        { id: "plain", updatedAt: 10, connectionId: "comparison" },
      ])
        sql.exec("INSERT INTO sessions VALUES(?,?)", session.id, JSON.stringify(session));
      sql.exec(
        "INSERT INTO messages(sessionId,role,content,displayContent,createdAt,estimated) VALUES('history','user','private attachment text','attachment preview',?,1)",
        now,
      );
      sql.exec(
        "INSERT INTO messages(sessionId,role,content,createdAt) VALUES('history','assistant','reply',?)",
        now + 1,
      );
      sql.exec(
        "INSERT INTO plugins VALUES('personal',?)",
        JSON.stringify({
          id: "personal",
          pluginId: "wechatai/personal-assistant",
          recordScope: "connection",
          enabled: true,
          currency: "CNY",
        }),
      );
      sql.exec("INSERT INTO personal_record_state VALUES('personal','deleted',3,'[]')");
      for (const [i, kind, scope, amount, direction, currency] of [
        [0, "note", "comparison", null, "expense", "CNY"],
        [1, "entry", "comparison", "1.23", "income", "CNY"],
        [2, "entry", "comparison", "12.34", "expense", "CNY"],
        [3, "entry", "comparison", "9.99", "expense", "USD"],
        [4, "reminder", "", null, "expense", "CNY"],
      ]) {
        const rid = cloudId(200 + i);
        const fields = {
          kind,
          title: "  记录" + i + "  ",
          date: "2026-11-01",
          content: "记账book%",
          private: "discard",
          amount,
          direction,
          currency,
          completed: false,
          ...(kind === "reminder"
            ? {
                remindAt: "2026-11-04T10:00:00+08:00",
                repeat: "daily",
                reminderType: "daily_tasks",
              }
            : {}),
        };
        sql.exec(
          "INSERT INTO personal_records VALUES(?,?,?,?,?,?,?,?,?,?)",
          rid,
          "personal",
          1,
          kind,
          fields.date,
          Math.round(Number(amount) * 100),
          JSON.stringify(fields),
          50,
          70 + i,
          scope,
        );
        if (kind === "reminder")
          sql.exec(
            "INSERT INTO personal_reminders(id,pluginId,recordId,revision,dueAt,repeatMs,connectionId,generation,state,retryAt,error,lastFailure) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            rid,
            "personal",
            rid,
            1,
            700,
            86400000,
            "comparison",
            "generation",
            "retry",
            800,
            "先前发送失败",
            JSON.stringify({ code: "test", message: "先前发送失败", dueAt: 700, at: 710 }),
          );
      }
      const cloudScope = ["https://agt.example", "comparison-app", "comparison-tenant"];
      sql.exec(
        "INSERT INTO cloud_provision VALUES(1,?)",
        JSON.stringify({
          scope: JSON.stringify(cloudScope),
          externalId: "wechatai:" + this.ctx.id,
          workspaceId: "comparison-workspace",
          appUserId: "comparison-user",
        }),
      );
      for (let i = 0; i < 34; i++) {
        const state = i === 0 ? "accepted" : i === 1 ? "rejected" : "completed";
        const task = {
          pluginName: "测试",
          origin: cloudScope[0],
          appId: cloudScope[1],
          tenantId: cloudScope[2],
          callbackVersion: "v1",
          hidden: i === 33 ? 1 : 0,
          prompt: "private attachment input",
          displayPrompt: "附件任务",
          request: "private callback credential",
          deliveryStatus: i === 0 ? "pending" : "sent",
          ...(i === 0 ? { outcome: { status: "completed", attachments: [{}] } } : {}),
          ...(i > 1
            ? {
                units: 1750,
                outputFiles: [
                  {
                    id: assetIds[0],
                    name: "output.txt",
                    mime: "text/plain",
                    bytes: 7,
                    private: "hidden",
                  },
                ],
              }
            : {}),
        };
        sql.exec(
          "INSERT INTO cloud_tasks(id,pluginId,sessionId,connectionId,state,createdAt,updatedAt,deadline,nextAt,stopRequested,settled,stale,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          cloudId(i),
          i === 1 ? "secondary" : "cloud",
          i === 1 ? "deleted" : "history",
          "default",
          state,
          50 + Math.floor(i / 8),
          70,
          now + 86400000,
          now + 86400000,
          i === 1 ? 1 : 0,
          i > 1 ? 1 : 0,
          i === 1 ? 1 : 0,
          JSON.stringify(task),
        );
      }
      sql.exec(
        "INSERT INTO plugins VALUES(?,?)",
        notifyId,
        JSON.stringify({
          id: notifyId,
          pluginId: "wechatai/notification",
          enabled: true,
          connectionId: "comparison",
        }),
      );
      sql.exec(
        "INSERT INTO notification_jobs(id,pluginId,dedupe,fingerprint,connectionId,generation,title,text,state,createdAt,nextAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        notifyId,
        notifyId,
        "receipt",
        "hash",
        "comparison",
        "test",
        "主题",
        "secret message",
        "pending",
        now,
        now + 86400000,
      );
      for (const [i, kind] of ["openclaw", "hermes", "muse"].entries()) {
        const id = cloudId(100 + i);
        sql.exec(
          "INSERT INTO plugins VALUES(?,?)",
          id,
          JSON.stringify({
            id,
            pluginId: "wechatai/" + kind,
            name: kind,
            shortcut: kind,
            agentId: "main",
            enabled: true,
          }),
        );
      }
      sql.exec("INSERT INTO context_summaries VALUES('history','previous plot',4,11)");
      sql.exec("INSERT INTO usage VALUES(?,?,?,?)", "fixture-success", now, 113, 1250);
      sql.exec(
        "INSERT INTO call_failures VALUES(?,?,?,?)",
        "fixture-success",
        now,
        "superseded",
        null,
      );
      sql.exec(
        "INSERT INTO call_failures VALUES(?,?,?,?)",
        "fixture-failure",
        now,
        "request_failed",
        503,
      );
      sql.exec(
        "INSERT INTO platform_metering VALUES(?,?,?,?,?,?)",
        "fixture-success",
        "example/plugin",
        "v1",
        "demo",
        "{}",
        now,
      );
    });
  }
}

const owner = "isolated-rehearsal-user";
async function exerciseCallback(env, accountId) {
  const taskId = cloudId(2);
  const token = createCloudCallbackToken(env, accountId, taskId, Date.now() + 60000);
  const key = cloudCallbackSecret(env, accountId, taskId);
  // A nearly full body whose nested JSON representation would exceed the RPC limit.
  const base = {
    id: "drill-delivery",
    type: "job.completed",
    callbackJobId: "drill-job",
    workspaceId: "comparison-workspace",
    tenantId: "comparison-tenant",
    data: { result: "" },
  };
  const overhead = new TextEncoder().encode(JSON.stringify(base)).length;
  const signed = JSON.stringify({
    ...base,
    data: { result: '"'.repeat(Math.floor(((1 << 20) - overhead) / 2)) },
  });
  const send = async (raw, signRaw = raw) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await publicWorker.fetch(
      new Request("https://comparison.example" + CLOUD_CALLBACK_PATH + "/" + token, {
        method: "POST",
        body: raw,
        headers: {
          "x-agent-event": base.type,
          "x-agent-delivery": base.id,
          "x-agent-timestamp": timestamp,
          "x-agent-signature":
            "sha256=" +
            createHmac("sha256", key)
              .update(timestamp + "." + signRaw)
              .digest("hex"),
        },
      }),
      { ...env, API_LIMIT: { limit: async () => ({ success: true }) } },
    );
    return [response.status, await response.json()];
  };
  const mismatch = JSON.stringify({ ...base, tenantId: "other" });
  return [
    await send(signed),
    await send(signed),
    await send(JSON.stringify(base)),
    await send(mismatch),
    await send(mismatch, signed),
  ];
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const id = env.ACCOUNTS.idFromName(owner);
    const source = env.ACCOUNTS.get(id);
    if (path === "/receiver-state") return Response.json(await receiverStatus(env, id.toString()));
    if (path === "/receiver")
      return receiverConnection(env, id.toString(), { Upgrade: "websocket" });
    if (path === "/seed") {
      await source.identify(owner);
      await source.applyPayment({
        kind: "purchase",
        id: "fixture-payment-42",
        units: 42000,
        expires: Number.MAX_SAFE_INTEGER,
      });
      await source.seedComparison();
    }
    const command = (method, principal = { scope: "migration" }, params = []) =>
      callBackend(
        env.ORIGIN,
        env.SIGN,
        {
          version: "wechatai-rpc-v1",
          accountId: id.toString(),
          ownerId: owner,
          routeEpoch: 2,
          principal,
          method,
          params,
        },
        { referralDB: env.DB },
      );
    if (path === "/compare") {
      const admin = { scope: "admin", userId: "fixture-operator", adminUntil: Date.now() + 60000 };
      const grant = { userId: admin.userId, adminUntil: admin.adminUntil };
      const originalAdmin = await accountForAdmin(env, owner, grant);
      const reference = {
        stats: await originalAdmin.adminStats(),
        identity: await source.referralWechatIdentity(),
      };
      const replica = {};
      const user = { scope: "user", userId: owner };
      const readAssets = async (account) => {
        const out = [];
        for (const id of [...assetIds, "../bad"]) {
          const response = await account.imageAsset(id);
          out.push({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text(),
          });
        }
        return out;
      };
      const original = await accountForUser(env, owner);
      reference.assets = await readAssets(original);
      reference.callbacks = await exerciseCallback(env, id.toString());
      await env.DB.prepare("INSERT INTO account_backend_routes VALUES(?,?,'go',?)")
        .bind(owner, id.toString(), 2)
        .run();
      const routed = await accountForUser(env, owner);
      const routedAdmin = await accountForAdmin(env, owner, grant);
      const routedReferral = await accountForReferral(env, owner);
      // Replay the same payment recorded before the real legacy export.
      for (let i = 0; i < 2; i++)
        await applyAccountPayment(env, owner, {
          kind: "purchase",
          id: "fixture-payment-42",
          units: 42000,
          expires: Number.MAX_SAFE_INTEGER,
        });
      replica.stats = await routedAdmin.adminStats();
      replica.identity = await routedReferral.referralWechatIdentity();
      reference.membership = await originalAdmin.adminMembership();
      replica.membership = await routedAdmin.adminMembership();
      const bearer = await accountForNotification(env, id.toString());
      replica.assets = await readAssets(routed);
      replica.callbacks = await exerciseCallback(env, id.toString());
      for (const [location, epoch, code] of [
        ["frozen", 2, "account_unavailable"],
        ["go", 3, "account_changed"],
      ]) {
        await env.DB.prepare(
          "UPDATE account_backend_routes SET location=?,route_epoch=? WHERE owner_id=?",
        )
          .bind(location, epoch, owner)
          .run();
        try {
          await (await accountForUser(env, owner)).imageAsset(assetIds[0]);
          throw new Error("blocked route returned account data");
        } catch (error) {
          if (error.code !== code) throw error;
        }
      }
      await env.DB.prepare("DELETE FROM account_backend_routes WHERE owner_id=?").bind(owner).run();
      const listCloud = async (account) => {
        const api = async (name, p) => JSON.parse(await account.api(name, p));
        const first = await api("cloud.tasks", {});
        const next = await api("cloud.tasks", { cursor: first.data.nextCursor });
        return [
          first,
          next,
          await api("cloud.tasks", { pluginInstanceId: "secondary" }),
          await api("cloud.tasks", { cursor: "broken" }),
          await api("cloud.task", { id: cloudId(0) }),
          await api("cloud.task", { id: cloudId(1) }),
          await api("cloud.task", { id: cloudId(33) }),
        ];
      };
      reference.cloud = await listCloud(original);
      replica.cloud = await listCloud(routed);
      const readPersonal = async (account) => {
        const read = async (action, payload = {}) =>
          JSON.parse(await account.api("personal." + action, { pluginId: "personal", ...payload }));
        return [
          await read("scopes"),
          await read("list"),
          await read("list", { query: { kind: "entry", query: "BOOK%", offset: 1, limit: 1 } }),
          await read("list", { connectionId: "", query: { reminderType: "daily_tasks" } }),
          await read("list", { connectionId: "deleted" }),
          await read("list", { connectionId: "unknown" }),
          await read("list", { query: { from: "2025-02-29" } }),
        ];
      };
      reference.personal = await readPersonal(original);
      replica.personal = await readPersonal(routed);
      const historyActions = [
        ["onboarding.dismiss", {}],
        ["session.list", {}],
        ["session.messages", { id: "history" }],
        ["session.messages", { id: "history", before: 2 }],
        ["session.messages", { id: "unknown" }],
        ["session.summary", { id: "history" }],
        ["session.summary", { id: "plain" }],
      ];
      reference.history = [];
      replica.history = [];
      for (const [action, payload] of historyActions) {
        reference.history.push(JSON.parse(await source.api(action, payload)));
        replica.history.push(JSON.parse(await routed.api(action, payload)));
      }
      const connectors = async (account) => {
        const out = [];
        for (const [i, kind] of ["openclaw", "hermes", "muse"].entries()) {
          const plugin = cloudId(100 + i);
          const name = kind === "openclaw" ? "claw" : kind;
          const invoke = async (op, id = plugin) =>
            JSON.parse(await account.api("plugin." + name + op, { id }));
          const before = await invoke("Status");
          const pair = await invoke("Pair");
          if (!pair.ok || Math.abs(pair.data.expiresAt - Date.now() - 600000) > 20000)
            throw new Error("invalid connector pairing");
          const pattern = new RegExp(
            (kind === "openclaw" ? "pair1" : kind + "-pair1") +
              "\\.[a-f0-9]{64}\\.[a-f0-9-]{36}\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}",
          );
          const code = pair.data.command.match(pattern)?.[0];
          if (!code || parseOpenClawPairing(env, "Bearer " + code, kind)?.pluginId !== plugin)
            throw new Error("edge did not recognize pairing");
          const token = await invoke("Token");
          if (
            !token.ok ||
            token.data.endpoint !== env.APP_URL ||
            parseOpenClawToken(env, "Bearer " + token.data.token, kind)?.pluginId !== plugin
          )
            throw new Error("edge did not recognize connector token");
          const reported = await invoke("Status");
          if (!reported.data.hasKey || reported.data.pairingClaimed)
            throw new Error("unexpected rotated state");
          await invoke("Revoke");
          const after = await invoke("Status");
          if (after.data.hasKey) throw new Error("revocation did not clear credential");
          out.push([
            before,
            pair.data.command.replace(code, "[code]"),
            reported,
            after,
            await invoke("Token", "role"),
          ]);
        }
        return out;
      };
      reference.connectors = await connectors(original);
      replica.connectors = await connectors(routed);
      const tokenFlow = async (account, bearerAccount) => {
        const valid = (raw) => bearerAccount.notificationCredentialValid(notifyId, raw);
        const action = async (name, id = notifyId) =>
          JSON.parse(await account.api("notification." + name, { id }));
        const before = await action("status");
        const mint = async () => {
          const r = await action("token");
          const parsed = parseNotificationToken(env, "Bearer " + r.data.token);
          if (
            !parsed ||
            parsed.accountId !== id.toString() ||
            parsed.pluginId !== notifyId ||
            r.data.endpoint !== "https://comparison.example/api/notify"
          )
            throw new Error("incompatible notification token");
          return parsed.credential;
        };
        const old = await mint(),
          current = await mint();
        if ((await valid(old)) || !(await valid(current)))
          throw new Error("token rotation did not retire the old credential");
        const during = await action("status");
        const external = async (credential, op, body, key = "") =>
          JSON.parse(await bearerAccount.notificationRequest(notifyId, credential, op, body, key));
        const receipt = await external(current, "status", notifyId);
        const missing = await external(current, "status", cloudId(1));
        const malformed = await external(current, "send", { text: " " });
        const denied = await external(old, "status", notifyId);
        if (
          receipt.data.title !== "主题" ||
          missing.error !== "notification_missing" ||
          malformed.error !== "invalid_message" ||
          denied.error !== "invalid_token"
        )
          throw new Error("notification API mismatch");
        const revoke = await action("revoke");
        if (await valid(current)) throw new Error("revoked credential was accepted");
        const after = await action("status");
        if (
          before.data.hasToken ||
          !during.data.hasToken ||
          after.data.hasToken ||
          after.data.deliveries[0].state !== "cancelled" ||
          "text" in after.data.deliveries[0]
        )
          throw new Error("unexpected credential or receipt state");
        return [
          before,
          during,
          receipt,
          missing,
          malformed,
          denied,
          revoke,
          after,
          await action("status", "role"),
          await action("status", "missing"),
        ];
      };
      reference.notify = await tokenFlow(original, source);
      replica.notify = await tokenFlow(routed, bearer);
      const noticeFlow = async (get, mark) => {
        const first = await get();
        const stale = await mark("0.0.0");
        const again = await get();
        const read = await mark(first.version);
        const repeat = await mark(first.version);
        const last = await get();
        if (
          stale ||
          !read ||
          !repeat ||
          first.isRead ||
          again.isRead ||
          !last.isRead ||
          !Number.isSafeInteger(first.createdAt) ||
          first.createdAt <= 0 ||
          first.createdAt !== again.createdAt ||
          first.createdAt !== last.createdAt
        )
          throw new Error("unexpected connector notice state");
        return { version: first.version, connections: first.connections, isRead: last.isRead };
      };
      reference.notice = await noticeFlow(
        () => source.connectorUpdateNotice(),
        (version) => source.readConnectorUpdateNotice(version),
      );
      replica.notice = await noticeFlow(
        () => command("connectorUpdateNotice", user),
        (version) => command("readConnectorUpdateNotice", user, [version]),
      );
      const tokens = [
        [["fixture-plugin", "fixture-credential"], true],
        [["fixture-plugin", "rotated"], false],
        [["other", "fixture-credential"], false],
      ];
      for (const [args, valid] of tokens) {
        const expected = await source.notificationCredentialValid(...args);
        const actual = await command(
          "notificationCredentialValid",
          { scope: "notification" },
          args,
        );
        if (actual !== expected || actual !== valid)
          throw new Error("notification credential mismatch");
      }
      const award = (invitee, role) => routedReferral.applyReferralReward(invitee, role);
      for (const [invitee, role] of [
        [owner, "invitee"],
        ["invited-friend", "inviter"],
      ]) {
        for (let attempt = 0; attempt < 2; attempt++) {
          await source.applyReferralReward(invitee, role);
          await award(invitee, role);
        }
      }
      for (const [invitee, role] of [
        ["pending-friend", "inviter"],
        ["invited-friend", "invitee"],
      ]) {
        try {
          await award(invitee, role);
          throw new Error("ineligible recipient accepted");
        } catch (error) {
          if (error.code !== "invalid_referral" || error.status !== 403) throw error;
        }
      }
      return Response.json({ reference, replica, grants: await source.referralEntries() });
    }
    if (path === "/activate") {
      try {
        return Response.json(await command("migration.activate"));
      } catch (error) {
        return Response.json({ code: error.code }, { status: error.status });
      }
    }
    const route = await env.DB.prepare("SELECT location FROM drill_reads WHERE owner=?")
      .bind(owner)
      .first();
    if (route.location === "go") {
      return Response.json({ location: "go", state: await command("migration.status") });
    }
    return Response.json({
      location: "do",
      id: id.toString(),
      membership: await source.adminMembership(),
    });
  },
};
