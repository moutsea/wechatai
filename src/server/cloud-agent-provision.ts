import { CloudAgentClient } from "./cloud-agent-client";
import type { CloudAgentStore, CloudProvision } from "./cloud-agent-store";
import { AppError, type CloudAgentConfig } from "./config";

/** Credentials and profile versions can change without moving the account's workspace. */
export const cloudAgentScope = (config: Pick<CloudAgentConfig, "origin" | "appId" | "tenantId">) =>
  JSON.stringify([config.origin, config.appId, config.tenantId]);

/**
 * Run from the account's serialized task runner. Each completed step is durable
 * before the next request; retries reuse AGT's stable user and workspace names.
 * The client verifies upstream identity before a resource ID is persisted here.
 * workspaceName must come from the persisted task, not newly read configuration.
 */
export async function ensureCloudAgentProvision(
  config: CloudAgentConfig,
  store: CloudAgentStore,
  accountId: string,
  workspaceName: string,
): Promise<CloudProvision> {
  const scope = cloudAgentScope(config);
  const old = store.provision();
  if (old && old.scope !== scope)
    throw new AppError("cloud_scope_changed", "账号云端空间与当前服务不一致", 503);

  let record: CloudProvision = old ?? {
    scope,
    profiles: [],
    externalId: `wechatai:${accountId}`,
    appUserId: "",
    workspaceId: "",
    configured: 0,
    updatedAt: Date.now(),
  };
  const client = new CloudAgentClient(config);
  if (!record.appUserId) {
    record = {
      ...record,
      appUserId: await client.ensureAppUser(record.externalId),
      updatedAt: Date.now(),
    };
    store.saveProvision(record);
  }
  if (!record.workspaceId) {
    record = {
      ...record,
      workspaceId: await client.ensureWorkspace(workspaceName),
      updatedAt: Date.now(),
    };
    store.saveProvision(record);
  }
  if (!record.profiles.includes(config.agentId)) {
    await client.configureAgent(record.workspaceId);
    record = {
      ...record,
      profiles: [...record.profiles, config.agentId],
      configured: 1,
      updatedAt: Date.now(),
    };
    store.saveProvision(record);
  }
  return record;
}
