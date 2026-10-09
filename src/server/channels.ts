import type { Assistant, Channel, ModelInput } from "../shared/types";

export type StoredChannel = Channel & { encryptedKey: string; keyContext: string };
export type StoredModel = ModelInput & { id: string; createdAt: number };
export type ResolvedModel = Assistant & { encryptedKey: string; keyContext: string };

// Preserve model/session IDs and the original encryption binding without decrypting keys.
// All writes run in one transaction; a restart cannot leave half-migrated accounts.
export function migrateChannels(storage: DurableObjectStorage) {
  storage.transactionSync(() => {
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
    );
    const rows = storage.sql
      .exec<{ data: string }>("SELECT data FROM assistants ORDER BY rowid")
      .toArray();
    for (const row of rows) {
      const legacy = JSON.parse(row.data) as Assistant & { encryptedKey: string };
      if (legacy.channelId) continue;
      const { protocol, baseUrl, encryptedKey, hasKey, ...fields } = legacy;
      const channel: StoredChannel = {
        id: legacy.id,
        name: legacy.name,
        description: "",
        protocol,
        baseUrl,
        color: legacy.color,
        createdAt: legacy.createdAt,
        hasKey,
        encryptedKey,
        keyContext: `assistant:${legacy.id}`,
      };
      storage.sql.exec("INSERT INTO channels VALUES (?, ?)", channel.id, JSON.stringify(channel));
      storage.sql.exec(
        "UPDATE assistants SET data = ? WHERE id = ?",
        JSON.stringify({ ...fields, channelId: channel.id }),
        legacy.id,
      );
    }
  });
}

export function resolveModel(model: StoredModel, channel: StoredChannel): ResolvedModel {
  return {
    ...model,
    // Legacy models retain their existing effective input budget until explicitly edited.
    maxInputTokens: model.maxInputTokens ?? model.contextTokens,
    channelName: channel.name,
    protocol: channel.protocol,
    baseUrl: channel.baseUrl,
    hasKey: channel.hasKey,
    encryptedKey: channel.encryptedKey,
    keyContext: channel.keyContext,
  };
}
