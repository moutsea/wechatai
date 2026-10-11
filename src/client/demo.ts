import { notificationInputSchema } from "../shared/notification";
import {
  personalAssistantInputSchema,
  personalRecordInputSchema,
  personalQuerySchema,
  amountCents,
  centsAmount,
  type PersonalRecord,
} from "../shared/personal-assistant";
import { roleplayInputSchema, roleVariables } from "../shared/roleplay";
import { isRemoteAgent } from "../shared/remote-agent";
import { openClawInputSchema } from "../shared/openclaw";
import { BILLING_OFFERS } from "../shared/billing";
import type { Assistant, Channel, ChatSession, ChatMessage, Snapshot } from "../shared/types";
import { imageGenerationInputSchema, type UserPlugin } from "../shared/image-generation";
import { webResearchInputSchema, type WebResearchPlugin } from "../shared/web-research";
const now = Date.now();
const defaults = {
  systemPrompt: "你是一个友好可靠的助手，用清晰自然的中文回答。",
  baseUrl: "https://api.openai.com",
  maxOutputTokens: 1024,
  maxInputTokens: 8000,
  contextTokens: 8000,
  maxCredits: 30,
  createdAt: now,
  hasKey: true,
};
export function createDemo() {
  let plugins: UserPlugin[] = [];
  const personal = new Map<string, PersonalRecord[]>();
  const summaries = new Map<
    string,
    { text: string; updatedAt: number; contextStart: number; resetAt: number; throughId: number }
  >();
  let assistants: Assistant[] = [
    {
      ...defaults,
      id: "demo-1",
      channelId: "channel-1",
      channelName: "OpenAI",
      name: "GPT-4.1 mini",
      description: "日常提问与灵感交流。",
      protocol: "responses",
      model: "gpt-4.1-mini",
      shortcut: "灵感",
      color: "sage",
    },
    {
      ...defaults,
      id: "demo-2",
      channelId: "channel-2",
      channelName: "Anthropic",
      name: "Claude Sonnet 4.5",
      description: "文字润色与表达建议。",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      shortcut: "写作",
      color: "peach",
    },
    {
      ...defaults,
      id: "demo-3",
      channelId: "channel-3",
      channelName: "DeepSeek",
      name: "DeepSeek Chat",
      description: "代码解释与编程问题讨论。",
      protocol: "chat-completions",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      shortcut: "代码",
      color: "blue",
    },
  ];
  let channels: Channel[] = assistants.map((a) => ({
    id: a.channelId,
    name: a.channelName,
    description: "",
    protocol: a.protocol,
    baseUrl: a.baseUrl,
    color: a.color,
    createdAt: now,
    hasKey: true,
  }));
  assistants.push({
    ...assistants[0],
    id: "demo-4",
    name: "GPT-4.1",
    model: "gpt-4.1",
    description: "复杂问题，慢慢想清楚。",
    shortcut: "分析",
    color: "lavender",
  });
  const lastModels = new Map<string, string>();
  let sessions: ChatSession[] = [
    {
      id: "s1",
      assistantId: "demo-1",
      title: "给周末留一点空白",
      archived: false,
      createdAt: now - 3600000,
      updatedAt: now - 600000,
      resetAt: 0,
      messageCount: 4,
    },
    {
      id: "s2",
      assistantId: "demo-2",
      title: "关于那篇迟迟没写完的文章",
      archived: false,
      createdAt: now - 86400000,
      updatedAt: now - 7200000,
      resetAt: 0,
      messageCount: 2,
    },
    {
      id: "s3",
      assistantId: "demo-3",
      title: "理解 React 的状态更新",
      archived: false,
      createdAt: now - 172800000,
      updatedAt: now - 86400000,
      resetAt: 0,
      messageCount: 2,
    },
    {
      id: "s4",
      assistantId: "demo-1",
      title: "一周的晚餐灵感",
      archived: true,
      createdAt: now - 345600000,
      updatedAt: now - 172800000,
      resetAt: 0,
      messageCount: 2,
    },
  ];
  const contents: Record<string, string[]> = {
    s1: [
      "这周有点累，周末想慢下来，但又不想两天什么都没做。",
      "可以给周末留 **三个很小的期待**：\n\n1. **早上** · 去一家没去过的早餐店，不赶时间。\n2. **下午** · 散步半小时，把手机留在口袋里。\n3. **晚上** · 读几页书，或者认真看一部电影。\n\n> 不用把每个空格都填满。休息本身，就是一件值得完成的事。",
      "喜欢这个思路，帮我起一个周末计划的名字吧。",
      "就叫 **「给周末留一点空白」** 吧。\n\n不需要满满当当，也可以很充实。",
    ],
    s2: [
      "想写一篇关于日常生活的小文章，开头总觉得太正式。",
      "试试从一个具体的小瞬间开始：\n\n“今天的咖啡比昨天淡了一点，但窗外的光刚刚好。”\n\n先让读者走进一个场景，再慢慢聊你想说的事。",
    ],
    s3: [
      "为什么调用 setState 之后，立刻读取还是旧值？",
      "### 状态是一次渲染的快照\n\n调用 `setCount` 会安排下一次渲染，当前函数里的 `count` 仍然是这一次的值。\n如果需要基于旧值更新，可以使用 **函数式更新**：\n\n```jsx\nfunction Counter() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <button onClick={() => setCount((value) => value + 1)}>\n      已点击 {count} 次\n    </button>\n  );\n}\n```\n\n| 写法 | 适合的场景 |\n| --- | --- |\n| `setCount(10)` | 直接替换为确定的值 |\n| `setCount(c => c + 1)` | 根据上一次的状态计算 |\n\n> 状态更新后，新的值会在下一次渲染中生效。\n\n可以继续阅读 [React 状态快照](https://react.dev/learn/state-as-a-snapshot)。",
    ],
    s4: ["推荐几个简单的晚餐。", "番茄鸡蛋面、香菇鸡肉饭、杂蔬烩豆腐，都适合忙碌的工作日。"],
  };
  const messages: Record<string, ChatMessage[]> = Object.fromEntries(
    sessions.map((s) => [
      s.id,
      (contents[s.id] || []).map((content, i) => ({
        id: i + 1,
        sessionId: s.id,
        role: i % 2 ? "assistant" : "user",
        content,
        createdAt: s.updatedAt - (4 - i) * 60000,
        inputTokens: i % 2 ? 820 : 0,
        outputTokens: i % 2 ? 240 : 0,
        cost: i % 2 ? 0.548 : 0,
        estimated: false,
        model: assistants.find((a) => a.id === s.assistantId)!.model,
      })),
    ]),
  );
  let current = "s1";
  let lastPlainSession = current;
  let connected = true;
  const snapshot = (): Snapshot => ({
    plan: "plus",
    plugins,
    planUntil: now + 20 * 86400000,
    channels,
    assistants: assistants.map((a) => ({
      ...a,
      channelName: channels.find((c) => c.id === a.channelId)?.name || "",
      protocol: channels.find((c) => c.id === a.channelId)!.protocol,
      baseUrl: channels.find((c) => c.id === a.channelId)!.baseUrl,
    })),
    currentSession: sessions.find((s) => s.id === current)
      ? {
          id: current,
          pluginInstanceId: sessions.find((s) => s.id === current)?.pluginInstanceId,
          pluginName: sessions.find((s) => s.id === current)?.pluginName,
          title: sessions.find((s) => s.id === current)!.title,
          assistantId: sessions.find((s) => s.id === current)!.assistantId,
          channelId: assistants.find(
            (a) => a.id === sessions.find((s) => s.id === current)!.assistantId,
          )!.channelId,
          channelName: channels.find(
            (c) =>
              c.id ===
              assistants.find((a) => a.id === sessions.find((s) => s.id === current)!.assistantId)!
                .channelId,
          )!.name,
          model: assistants.find(
            (a) => a.id === sessions.find((s) => s.id === current)!.assistantId,
          )!.model,
          assistantName:
            assistants.find((a) => a.id === sessions.find((s) => s.id === current)!.assistantId)
              ?.name || "",
        }
      : null,
    connection: {
      status: connected ? "connected" : "disconnected",
      lastSeen: now - 600000,
      botId: "preview-only",
    },
    wallet: {
      balance: 1996.272,
      debt: 0,
      daily: 981.36,
      purchased: 1000,
      referral: 0,
      subscription: 0,
      dailyGrant: 1000,
      dailyGrants: { free: 100, plus: 1000 },
      resetsAt: now + 86400000,
      spentToday: 3.728,
    },
    stats: {
      sessions: sessions.length,
      messages: Object.values(messages).flat().length,
      tokens: 182460,
    },
    selectedConnectionId: "default",
    connections: [
      {
        id: "default",
        name: "我的微信",
        createdAt: now,
        paused: false,
        status: connected ? "connected" : "disconnected",
        lastSeen: now - 600000,
        currentSessionId: current,
      },
    ],
    limits: { connections: 10, assistants: 20, channels: 20, modelsPerChannel: 50, sessions: 200 },
    ledger: [
      {
        id: "l1",
        kind: "usage",
        amount: -0.548,
        note: "实际消耗 0.548 credits",
        meter: {
          policyVersion: "gateway-v1",
          tokenizerVersion: "cl100k_base@gpt-tokenizer-4.0.0",
          inputTokens: 1140,
          outputTokens: 200,
          outputImages: 0,
          units: 548,
        },
        createdAt: now - 600000,
      },
      {
        id: "l2",
        kind: "purchase",
        amount: 1000,
        note: "Credits 充值（示例）",
        createdAt: now - 86400000,
      },
      {
        id: "l3",
        kind: "daily",
        amount: 1000,
        note: "每日赠送（Plus 示例）",
        createdAt: now - 3600000,
      },
    ],
    activity: [22, 38, 16, 45, 30, 12, 3.728].map((credits, i) => ({
      day: new Date(now - (6 - i) * 86400000).toISOString().slice(0, 10),
      credits,
    })),
  });
  const create = (assistantId: string | null, title = "新的对话", pluginInstanceId?: string) => {
    const plugin = plugins.find((p) => p.id === pluginInstanceId);
    if (plugin) assistantId = "modelId" in plugin ? plugin.modelId : null;
    const s: ChatSession = {
      id: crypto.randomUUID(),
      assistantId,
      ...(plugin ? { pluginInstanceId: plugin.id, pluginName: plugin.name } : {}),
      title,
      archived: false,
      resetAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };
    sessions = [s, ...sessions];
    current = s.id;
    if (assistantId)
      lastModels.set(assistants.find((a) => a.id === assistantId)!.channelId, assistantId);
    messages[s.id] = [];
    if (plugin?.pluginId === "wechatai/roleplay" && plugin.firstMessage) {
      messages[s.id] = [
        {
          id: Date.now(),
          sessionId: s.id,
          role: "assistant",
          content: roleVariables(plugin.firstMessage, plugin),
          createdAt: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          estimated: false,
          model: "角色开场白",
        },
      ];
      s.messageCount = 1;
    }
    return s;
  };
  return async <T>(path: string, options?: RequestInit): Promise<T> => {
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    const method = options?.method || "GET";
    let result: unknown;
    if (path === "/plugins" || path.startsWith("/plugins/")) {
      const id = path.split("/")[2];
      const previous = plugins.find((p) => p.id === id);
      if (path.includes("/records")) {
        if (previous?.pluginId !== "wechatai/personal-assistant") throw new Error("配置不存在");
        const records = personal.get(id) ?? [];
        const recordId = path.split("/")[4];
        if (path.endsWith("/query")) {
          const q = personalQuerySchema.parse(body);
          const filtered = records.filter(
            (r) =>
              (!q.kind || r.kind === q.kind) &&
              (!q.reminderType || (r.kind === "reminder" && r.reminderType === q.reminderType)) &&
              (q.completed === undefined || r.completed === q.completed) &&
              (!q.from || r.date >= q.from) &&
              (!q.to || r.date <= q.to) &&
              (!q.query || [r.title, r.content, r.category].some((v) => v.includes(q.query))),
          );
          const totals = new Map<string, { income: number; expense: number }>();
          for (const r of filtered.filter((r) => r.kind === "entry")) {
            const t = totals.get(r.currency) ?? { income: 0, expense: 0 };
            t[r.direction] += amountCents(r.amount!);
            totals.set(r.currency, t);
          }
          result = {
            records: filtered.slice(q.offset, q.offset + q.limit),
            total: filtered.length,
            totals: [...totals].map(([currency, t]) => ({
              currency,
              income: centsAmount(t.income),
              expense: centsAmount(t.expense),
              net: centsAmount(t.income - t.expense),
            })),
          };
        } else if (method === "DELETE") {
          personal.set(
            id,
            records.filter((r) => r.id !== recordId),
          );
          result = { deleted: true };
        } else {
          const old = records.find((r) => r.id === body.recordId);
          const r: PersonalRecord = {
            ...personalRecordInputSchema.parse({ ...old, ...body.record }),
            id: old?.id ?? crypto.randomUUID(),
            revision: (old?.revision ?? 0) + 1,
            createdAt: old?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          };
          personal.set(id, [r, ...records.filter((v) => v.id !== r.id)]);
          result = r;
        }
      } else if (path.endsWith("/notification")) {
        result = { endpoint: "https://wechatai.app/api/notify", hasToken: false, deliveries: [] };
      } else if (path.includes("/notification/token")) {
        throw new Error("演示模式不生成真实 Token，请登录使用");
      } else if (path === "/plugins/exit") {
        const plain =
          sessions.find((s) => s.id === lastPlainSession && !s.pluginInstanceId && !s.archived) ??
          sessions.find((s) => !s.pluginInstanceId && !s.archived);
        current = (plain ?? create(assistants[0].id, "新的对话")).id;
        result = snapshot();
      } else if (/\/(openclaw|hermes)\/pair$/.test(path)) {
        result = {
          command: "# 演示预览：登录 Plus 账号后生成专属连接命令。",
          expiresAt: Date.now() + 600000,
        };
      } else if (/\/(openclaw|hermes)\/status$/.test(path) && isRemoteAgent(previous)) {
        result = {
          hasKey: false,
          lastSeen: 0,
          agents: [],
          agentId: previous.agentId,
          deliveries: [],
        };
      } else if (method === "GET") result = plugins;
      else if (method === "DELETE") {
        personal.delete(id);
        plugins = plugins.filter((p) => p.id !== id);
        result = snapshot();
      } else if (path.endsWith("/activate") && previous) {
        if (!sessions.find((s) => s.id === current)?.pluginInstanceId) lastPlainSession = current;
        const s =
          sessions.find((s) => s.pluginInstanceId === id && !s.archived) ??
          create("modelId" in previous ? previous.modelId : null, "新的对话", previous.id);
        s.pluginInstanceId = id;
        s.pluginName = previous.name;
        current = s.id;
        result = s;
      } else if (path.endsWith("/test"))
        result = {
          text:
            previous?.pluginId === "wechatai/personal-assistant"
              ? "**这是个人助理预览示例**，没有调用模型、保存记录或设置提醒。"
              : previous?.pluginId === "wechatai/image-generation"
                ? "**这是预览示例**，不会实际生成图片或扣费。正式使用时，这里会显示图片，可打开原图保存。"
                : previous?.pluginId === "wechatai/roleplay"
                  ? "**这是角色对话预览**，正式使用时会根据你的角色设定回复。测试不会写入故事会话。"
                  : "**这是预览示例**，未发送真实搜索或模型请求。\n\n正式使用时，这里会显示模型根据资料整理的回答和来源链接。",
          cost: 0,
        };
      else if (
        ["wechatai/openclaw", "wechatai/hermes"].includes(body.pluginId ?? previous?.pluginId)
      ) {
        const p: UserPlugin = {
          ...openClawInputSchema.parse({ ...previous, ...body }),
          id: id || crypto.randomUUID(),
          pluginId: body.pluginId ?? previous?.pluginId,
          version: "1.0.0",
          createdAt: previous?.createdAt ?? Date.now(),
          hasKey: false,
        };
        plugins = [...plugins.filter((p) => p.id !== id), p];
        result = p;
      } else if ((body.pluginId ?? previous?.pluginId) === "wechatai/notification") {
        const p: UserPlugin = {
          ...notificationInputSchema.parse({ ...previous, ...body }),
          id: id || crypto.randomUUID(),
          pluginId: "wechatai/notification",
          version: "1.0.0",
          shortcut: "notice_demo",
          createdAt: previous?.createdAt ?? Date.now(),
          hasKey: false,
        };
        plugins = [...plugins.filter((p) => p.id !== id), p];
        result = p;
      } else if ((body.pluginId ?? previous?.pluginId) === "wechatai/personal-assistant") {
        const p: UserPlugin = {
          ...personalAssistantInputSchema.parse({ ...previous, ...body }),
          id: id || crypto.randomUUID(),
          pluginId: "wechatai/personal-assistant",
          version: "1.0.0",
          createdAt: previous?.createdAt ?? Date.now(),
          hasKey: true,
        };
        if (plugins.some((other) => other.id !== id && other.shortcut === p.shortcut))
          throw new Error("这个快捷名称已被使用");
        plugins = [...plugins.filter((p) => p.id !== id), p];
        result = p;
      } else if ((body.pluginId ?? previous?.pluginId) === "wechatai/roleplay") {
        const input = roleplayInputSchema.parse({ ...previous, ...body });
        if (
          plugins.some(
            (p) => p.id !== id && p.shortcut.toLowerCase() === input.shortcut.toLowerCase(),
          ) ||
          assistants.some((a) => a.shortcut.toLowerCase() === input.shortcut.toLowerCase())
        )
          throw new Error("这个快捷名称已被使用");
        const p: UserPlugin = {
          ...input,
          id: id || crypto.randomUUID(),
          pluginId: "wechatai/roleplay",
          version: "1.0.0",
          createdAt: previous?.createdAt ?? Date.now(),
          hasKey: true,
        };
        plugins = [...plugins.filter((p) => p.id !== id), p];
        sessions = sessions.map((s) =>
          s.pluginInstanceId === p.id ? { ...s, assistantId: p.modelId, pluginName: p.name } : s,
        );
        result = p;
      } else if ((body.pluginId ?? previous?.pluginId) === "wechatai/image-generation") {
        const input = imageGenerationInputSchema.parse({ ...previous, ...body });
        if (
          plugins.some((p) => p.id !== id && p.shortcut === input.shortcut) ||
          assistants.some((a) => a.shortcut === input.shortcut)
        )
          throw new Error("这个快捷名称已被使用");
        const p: UserPlugin = {
          ...input,
          id: id || crypto.randomUUID(),
          pluginId: "wechatai/image-generation",
          version: "1.2.0",
          createdAt: previous?.createdAt ?? Date.now(),
          hasKey: true,
        };
        plugins = [...plugins.filter((p) => p.id !== id), p];
        result = p;
      } else {
        const { apiKey, ...input } = webResearchInputSchema.parse(body);
        if (
          plugins.some((p) => p.id !== id && p.shortcut === input.shortcut) ||
          assistants.some((a) => a.shortcut === input.shortcut)
        )
          throw new Error("这个快捷名称已被使用");
        const p: WebResearchPlugin = {
          ...input,
          id: id || crypto.randomUUID(),
          pluginId: "wechatai/web-research",
          version: "1.3.0",
          createdAt: previous?.createdAt ?? Date.now(),
          hasKey: Boolean(apiKey || previous?.hasKey),
        };
        plugins = [...plugins.filter((p) => p.id !== id), p];
        result = p;
      }
      return structuredClone(result) as T;
    }
    if (/^\/channels\/[^/]+\/models$/.test(path)) {
      body.channelId = path.split("/")[2];
      path = "/assistants";
    } else if (path === "/channels" || path.startsWith("/channels/")) {
      const id = path.split("/")[2];
      const channel = channels.find((c) => c.id === id);
      if (path === "/channels") {
        const saved = {
          ...body,
          apiKey: undefined,
          id: crypto.randomUUID(),
          hasKey: true,
          createdAt: Date.now(),
        };
        channels.push(saved);
        result = saved;
      } else if (!channel) throw new Error("渠道不存在");
      else if (path.endsWith("/models/import")) {
        const catalog =
          channel.protocol === "anthropic"
            ? ["claude-sonnet-4-5", "claude-haiku-4-5"]
            : channel.protocol === "responses"
              ? ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano"]
              : ["deepseek-chat", "deepseek-reasoner"];
        const existing = assistants.filter((a) => a.channelId === id);
        const pending = catalog.filter((model) => !existing.some((a) => a.model === model));
        const importing = pending.slice(0, Math.max(0, 50 - existing.length));
        for (const model of importing)
          assistants.push({
            ...defaults,
            id: crypto.randomUUID(),
            channelId: id,
            channelName: channel.name,
            name: model,
            model,
            description: "",
            shortcut: "",
            protocol: channel.protocol,
            baseUrl: channel.baseUrl,
            color: channel.color,
          });
        if (!current && assistants[0]) create(assistants[0].id);
        result = {
          total: catalog.length,
          imported: importing.length,
          existing: catalog.length - pending.length,
          invalid: 0,
          limited: pending.length - importing.length,
        };
      } else if (path.endsWith("/activate")) {
        const candidates = assistants.filter((a) => a.channelId === id);
        const target = candidates.find((a) => a.id === lastModels.get(id)) ?? candidates[0];
        if (!target) throw new Error("请先添加模型");
        const session =
          sessions.find((s) => s.assistantId === target.id && !s.archived) ?? create(target.id);
        current = session.id;
        lastModels.set(id, target.id);
        result = session;
      } else if (method === "DELETE") {
        const ids = assistants.filter((a) => a.channelId === id).map((a) => a.id);
        for (const session of sessions.filter(
          (s) => s.assistantId !== null && ids.includes(s.assistantId),
        ))
          delete messages[session.id];
        sessions = sessions.filter((s) => !(s.assistantId !== null && ids.includes(s.assistantId)));
        assistants = assistants.filter((a) => a.channelId !== id);
        channels = channels.filter((c) => c.id !== id);
        if (!sessions.some((s) => s.id === current)) {
          current = sessions.find((s) => !s.archived)?.id || "";
          if (!current && assistants[0]) create(assistants[0].id);
        }
        result = snapshot();
      } else {
        Object.assign(channel, body, { apiKey: undefined });
        result = channel;
      }
      return structuredClone(result) as T;
    } else if (path.startsWith("/models/")) path = path.replace("/models/", "/assistants/");
    if (path === "/dashboard") result = snapshot();
    else if (path === "/sessions" && method === "GET") result = sessions;
    else if (path === "/sessions")
      result = create(body.assistantId, body.title, body.pluginInstanceId);
    else if (/^\/sessions\/[^/]+\/messages/.test(path))
      result = (messages[path.split("/")[2]] || [])
        .filter(
          (m) =>
            m.id <
            (Number(new URL(path, "https://demo.local").searchParams.get("before")) ||
              Number.MAX_SAFE_INTEGER),
        )
        .slice(-100);
    else if (/^\/sessions\/[^/]+\/summary$/.test(path)) {
      const id = path.split("/")[2];
      if (method === "PATCH")
        summaries.set(id, {
          text: body.text,
          updatedAt: Date.now(),
          throughId: 0,
          contextStart: 0,
          resetAt: 0,
        });
      result = summaries.get(id) ?? {
        text: "",
        updatedAt: 0,
        throughId: 0,
        contextStart: 0,
        resetAt: 0,
      };
    } else if (path.startsWith("/sessions/")) {
      const s = sessions.find((s) => s.id === path.split("/")[2]);
      if (!s) throw new Error("会话不存在");
      if (body.action === "switch") {
        current = s.id;
        if (s.assistantId)
          lastModels.set(assistants.find((a) => a.id === s.assistantId)!.channelId, s.assistantId);
      }
      if (body.action === "rename") s.title = body.title;
      if (body.action === "archive") {
        s.archived = true;
        if (current === s.id) create(s.assistantId, "新的对话", s.pluginInstanceId);
      }
      if (["reset", "clear", "delete"].includes(body.action)) summaries.delete(s.id);
      if (body.action === "restore") s.archived = false;
      if (body.action === "reset")
        messages[s.id].push({
          id: Date.now(),
          sessionId: s.id,
          role: "system",
          content: "上下文已重置，之前的消息不会再发送给模型。",
          createdAt: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          estimated: false,
          model: "",
        });
      if (body.action === "clear" || body.action === "delete") {
        messages[s.id] = [];
        s.messageCount = 0;
      }
      if (body.action === "delete") {
        sessions = sessions.filter((item) => item.id !== s.id);
        if (current === s.id) create(s.assistantId, "新的对话", s.pluginInstanceId);
      }
      result = snapshot();
    } else if (path === "/assistants") {
      const channel = channels.find((c) => c.id === body.channelId);
      if (!channel) throw new Error("渠道不存在");
      if (assistants.some((a) => a.channelId === channel.id && a.model === body.model))
        throw new Error("这个渠道已添加该模型 ID");
      const a = {
        channelName: channel.name,
        protocol: channel.protocol,
        baseUrl: channel.baseUrl,
        ...body,
        apiKey: undefined,
        id: crypto.randomUUID(),
        hasKey: true,
        createdAt: Date.now(),
      };
      assistants = [...assistants, a];
      if (!current) create(a.id);
      result = a;
    } else if (path.endsWith("/test")) result = { text: "这是界面预览，未实际调用模型。", cost: 0 };
    else if (path.endsWith("/activate")) {
      const id = path.split("/")[2];
      const s = sessions.find((s) => s.assistantId === id && !s.archived) || create(id);
      current = s.id;
      lastModels.set(assistants.find((a) => a.id === id)!.channelId, id);
      result = s;
    } else if (path.startsWith("/assistants/")) {
      const id = path.split("/")[2];
      assistants =
        method === "DELETE"
          ? assistants.filter((a) => a.id !== id)
          : assistants.map((a) => (a.id === id ? { ...a, ...body, apiKey: undefined } : a));
      if (method === "DELETE") {
        const removed = sessions.filter((s) => s.assistantId === id);
        for (const s of removed) delete messages[s.id];
        sessions = sessions.filter((s) => s.assistantId !== id);
        if (removed.some((s) => s.id === current)) {
          current = sessions.find((s) => !s.archived)?.id || "";
          if (!current && assistants[0]) create(assistants[0].id);
        }
      }
      result = snapshot();
    } else if (path === "/wechat/disconnect") {
      connected = false;
      result = snapshot();
    } else if (path === "/wechat/bind")
      throw new Error("预览模式不会连接微信。请注册后使用真实扫码绑定。");
    else if (path === "/billing/catalog")
      result = {
        mode: "test",
        offers: BILLING_OFFERS.map((o) => ({
          ...o,
          currency: "cny",
          price: o.amount / 100,
          enabled: false,
        })),
      };
    else if (path === "/billing/subscription") result = null;
    else if (path === "/referrals")
      result = {
        url: "",
        reward: 500,
        registered: 3,
        completed: 2,
        earned: 1000,
        received: null,
        recent: [
          { id: "demo-invite-1", name: "林***", status: "pending", createdAt: now - 3600000 },
          { id: "demo-invite-2", name: "小***", status: "rewarded", createdAt: now - 86400000 },
          { id: "demo-invite-3", name: "陈***", status: "rewarded", createdAt: now - 172800000 },
        ],
      };
    else if (path === "/privacy/history") {
      sessions = [];
      for (const id of Object.keys(messages)) delete messages[id];
      current = "";
      result = snapshot();
    } else throw new Error("预览模式不执行支付或账号操作。");
    return structuredClone(result) as T;
  };
}
