// Test-only controls on an isolated workerd account. Public routes below use
// the production Worker, including receiver authentication and WS upgrades.
import worker, { PersonalAccount as Account } from "../../../../src/server/index";
import { encrypt } from "../../../../src/server/security";
export class PersonalAccount extends Account {
  async seed() {
    const creds = {
      token: "fixture",
      userId: "fixture-user",
      botId: "fixture-bot",
      baseUrl: "https://ilinkai.weixin.qq.com",
    };
    const encryptedCredentials = await encrypt(
      this.env,
      JSON.stringify(creds),
      this.ctx.id + ":wechat",
    );
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO settings VALUES('connection',?)",
      JSON.stringify({
        status: "connected",
        generation: "fixture-generation",
        cursor: "",
        encryptedCredentials,
      }),
    );
    return this.ctx.id.toString();
  }
  async recoverReceiverWatchdog(session) {
    this.ctx.storage.sql.exec(
      "INSERT INTO settings VALUES('recoveries','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1",
    );
    return super.recoverReceiverWatchdog(session);
  }
  async inspect() {
    const status = await this.receiverStatus();
    const calls = this.ctx.storage.sql
      .exec("SELECT value FROM settings WHERE key='recoveries'")
      .toArray();
    return { ...status, recoveries: Number(calls[0]?.value ?? 0) };
  }
}
export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname;
    if (path === "/fixture/seed" || path === "/fixture/inspect") {
      const a = env.ACCOUNTS.getByName("test-receiver-watchdog");
      return Response.json(path.endsWith("seed") ? await a.seed() : await a.inspect());
    }
    return worker.fetch(req, env, ctx);
  },
};
