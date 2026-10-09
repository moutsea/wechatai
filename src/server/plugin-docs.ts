import { hermesGuide } from "../shared/hermes-docs";
import { hermesManifest } from "../shared/hermes";
import { openClawGuide } from "../shared/openclaw-docs";
import { openClawManifest } from "../shared/openclaw";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { z } from "zod";
import {
  BILLING_POLICY_VERSION,
  IMAGE_CREDITS,
  PLUGIN_PROTOCOL_VERSION,
  TOKENIZER_VERSION,
  pluginBlockSchema,
  pluginEventSchema,
  pluginInvocationSchema,
  pluginManifestSchema,
  pluginResultSchema,
} from "../shared/plugins";
import { OUTPUT_TOKEN_WEIGHT, TOKENS_PER_CREDIT } from "../shared/credits";
import { imageGenerationManifest } from "../shared/image-generation";
import { webResearchManifest } from "../shared/web-research";
import {
  PLUGIN_API_PATH,
  PLUGIN_MARKDOWN_PATH,
  llmsText,
  protocolExamples,
  protocolLinks,
  protocolMarkdown,
} from "../shared/plugin-docs";

const definitions = {
  Manifest: pluginManifestSchema,
  Invocation: pluginInvocationSchema,
  Result: pluginResultSchema,
  Event: pluginEventSchema,
  Block: pluginBlockSchema,
};

// Derived from the execution contracts, never a separately maintained copy.
export const protocolJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: protocolLinks.schema,
  title: `Wechatai Plugin Protocol ${PLUGIN_PROTOCOL_VERSION}`,
  description:
    "Definition bundle. Validate a specific $defs entry; this bundle has no root type constraint. Structural validation does not grant execution permissions.",
  $defs: Object.fromEntries(
    Object.entries(definitions).map(([name, schema]) => {
      const { $schema: _dialect, ...definition } = z.toJSONSchema(schema, {
        target: "draft-2020-12",
        io: "input",
      });
      return [name, { title: name, ...definition }];
    }),
  ),
};

export const protocolIndex = {
  name: "Wechatai Plugin Protocol",
  protocolVersion: PLUGIN_PROTOCOL_VERSION,
  availability: {
    status: "builtin-only",
    executableRuntimes: ["builtin"],
    builtinPlugins: [
      protocolExamples.manifest.id,
      webResearchManifest.id,
      imageGenerationManifest.id,
      openClawManifest.id,
      hermesManifest.id,
    ],
    thirdPartyRegistration: false,
    publicInvocationApi: false,
    codeUpload: false,
    eventTransport: false,
    outputAssetDelivery: true,
    note: "可依据协议开发并在本地验证适配器；内置 AI 生图支持图片交付；第三方执行、上传、事件传输和媒体接入尚未开放。Invocation 是数据契约，不是一个公开 HTTP 调用入口。",
  },
  links: protocolLinks,
  schemas: Object.fromEntries(
    Object.keys(definitions).map((name) => [name, `${protocolLinks.schema}#/$defs/${name}`]),
  ),
  examples: protocolExamples,
  builtinManifests: [
    protocolExamples.manifest,
    webResearchManifest,
    imageGenerationManifest,
    openClawManifest,
    hermesManifest,
  ],
  billing: {
    authority: "platform",
    policyVersion: BILLING_POLICY_VERSION,
    tokenizerVersion: TOKENIZER_VERSION,
    tokensPerCredit: TOKENS_PER_CREDIT,
    outputTokenWeight: OUTPUT_TOKEN_WEIGHT,
    creditsPerOutputImage: IMAGE_CREDITS,
    unitsPerCredit: 1000,
    unitFormula: `ceil((inputTokens + ${OUTPUT_TOKEN_WEIGHT} * outputTokens) * 1000 / ${TOKENS_PER_CREDIT}) + outputImages * ${IMAGE_CREDITS * 1000}`,
    trustsPluginUsage: false,
    input:
      "Concatenate text blocks within each message, tokenize each message, then sum. Count the platform boundary snapshot, including supplied history and system text.",
    output:
      "Concatenate accepted final text blocks once. Internal calls, reasoning, progress, retries and upstream usage are excluded.",
    images:
      "Only unique output assets independently verified by the platform and scoped to this run are counted. Asset delivery is not yet open.",
  },
  validation: {
    dialect: "https://json-schema.org/draft/2020-12/schema",
    selectDefinition:
      "Use a $ref to one of the schemas URLs; the root document is a definition bundle, not a payload validator.",
    unknownFields: "rejected",
    openObjects: ["Manifest.configSchema", "Event.payload"],
    eventPayloadStatus: "reserved; per-event payload contracts are not defined",
    creditUnits: "null means no optional spending cap; 0 means zero budget. 1000 units = 1 credit.",
    additionalHostChecks: [
      "runId match",
      "permissions",
      "input/output budgets",
      "idempotency",
      "verified assets owned by account and run",
    ],
  },
};

// Keep these read-only routes separate from account auth and account rate limits.
// No cookies, secrets, database access or user-specific data belong in this router.
export const publicPluginDocs = new Hono();
publicPluginDocs.get("/developers/openclaw.md", (c) => {
  c.header("Content-Type", "text/markdown; charset=utf-8");
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(openClawGuide);
});
publicPluginDocs.get("/api/plugins/openclaw", (c) =>
  c.json({
    manifest: openClawManifest,
    documentation: "/developers/openclaw.md",
    transportVersion: "1",
  }),
);
publicPluginDocs.get("/developers/hermes.md", (c) => {
  c.header("Content-Type", "text/markdown; charset=utf-8");
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(hermesGuide);
});
publicPluginDocs.get("/api/plugins/hermes", (c) =>
  c.json({
    manifest: hermesManifest,
    documentation: "/developers/hermes.md",
    transportVersion: "1",
  }),
);
const protocolApi = new Hono();
const allow = "GET, HEAD, OPTIONS";
const publicCors = cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], maxAge: 86400 });
protocolApi.use("*", publicCors);
protocolApi.use("*", async (c, next) => {
  if (!["GET", "HEAD"].includes(c.req.method)) {
    c.header("Allow", allow);
    c.header("Cache-Control", "no-store");
    return c.json({ error: "method_not_allowed", message: "此处仅提供只读协议文档" }, 405);
  }
  c.header("Cache-Control", "public, max-age=300");
  await next();
});
protocolApi.use("*", etag());
protocolApi.get("/", (c) => c.json(protocolIndex));
protocolApi.get(`/${PLUGIN_PROTOCOL_VERSION}`, (c) => c.json(protocolIndex));
protocolApi.get(`/${PLUGIN_PROTOCOL_VERSION}/schema.json`, (c) => {
  c.header("Content-Type", "application/schema+json; charset=utf-8");
  return c.body(JSON.stringify(protocolJsonSchema));
});
protocolApi.all("*", (c) =>
  c.json(
    {
      error: "not_found",
      message: "没有找到这个协议版本或文档",
      supportedVersions: [PLUGIN_PROTOCOL_VERSION],
    },
    404,
  ),
);
publicPluginDocs.route(PLUGIN_API_PATH, protocolApi);

for (const [path, content, contentType] of [
  [PLUGIN_MARKDOWN_PATH, protocolMarkdown, "text/markdown; charset=utf-8"],
  ["/llms.txt", llmsText, "text/plain; charset=utf-8"],
] as const) {
  publicPluginDocs.use(path, publicCors);
  publicPluginDocs.use(path, etag());
  publicPluginDocs.all(path, (c) => {
    if (!["GET", "HEAD"].includes(c.req.method)) {
      c.header("Allow", allow);
      return c.json({ error: "method_not_allowed", message: "此处仅提供只读协议文档" }, 405);
    }
    c.header("Cache-Control", "public, max-age=300");
    c.header("Content-Type", contentType);
    return c.body(content);
  });
}
