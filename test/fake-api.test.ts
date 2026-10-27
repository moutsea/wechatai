import { describe, expect, expectTypeOf, it } from "vitest";
import { apiTypeLock, createFakeApi } from "./support/fake-api";
import type { Snapshot } from "../src/shared/types";

/**
 * `createFakeApi` 是客户端测试共用的内存夹具，行为要对齐真实 `api` 背后的服务端：
 * 连接上限、暂停规则、时间来源、路由集合。这些点以前全靠夹具「恒为演示状态」蒙过去，
 * 一旦有人把夹具写歪（比如 `paused` 恒 false、时钟写死、凭空多一条路由），
 * 上层客户端测试就会在假绿里跑着，所以单独钉在这里。
 */
describe("createFakeApi", () => {
  it("默认只有一条连接，未暂停，且默认选中它", async () => {
    const snapshot = await createFakeApi()<Snapshot>("/dashboard");
    expect(snapshot.connections).toHaveLength(1);
    expect(snapshot.connections[0].paused).toBe(false);
    expect(snapshot.selectedConnectionId).toBe("default");
    expect(snapshot.connections[0]).toMatchObject({ id: "default", name: "我的微信" });
  });

  it("第 limits.connections 条之后的连接按真实规则被暂停", async () => {
    const snapshot = await createFakeApi({ connections: 11 })<Snapshot>("/dashboard");
    expect(snapshot.limits.connections).toBe(10);
    expect(snapshot.connections).toHaveLength(11);
    expect(snapshot.connections.map((c) => c.paused)).toEqual([
      ...Array<boolean>(10).fill(false),
      true,
    ]);
    expect(snapshot.connections[10]).toMatchObject({
      id: "conn-11",
      name: "我的微信 11",
      paused: true,
    });
  });

  it("注入时钟后 planUntil 与 activity 都从该时钟派生", async () => {
    const now = 1700000000000;
    const snapshot = await createFakeApi({ now })<Snapshot>("/dashboard");
    expect(snapshot.planUntil).toBe(now + 20 * 86400000);
    expect(snapshot.activity.at(-1)?.day).toBe(new Date(now).toISOString().slice(0, 10));
  });

  it("GET /plugins/:id 是幽灵路由，服务端只有列表与子路由", async () => {
    const api = createFakeApi();
    await expect(api("/plugins/whatever")).rejects.toThrow("不支持：GET /plugins/:id");
    await expect(api("/plugins")).resolves.toEqual([]);
    // 拦截只针对「GET + 仅 id 一段」：子路由仍走原来的分支，别把整片 /plugins 封死。
    await expect(api("/plugins/whatever/models")).resolves.toEqual([]);
  });

  it("类型锁仍然把夹具签名钉在真实 api 上", () => {
    expectTypeOf(apiTypeLock).toEqualTypeOf<typeof import("../src/client/api").api>();
    expect(apiTypeLock).toBeTypeOf("function");
  });
});
