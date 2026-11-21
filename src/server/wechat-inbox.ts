import type { WechatTextReceipt, WxMessage } from "./wechat";

// The original inbox primary key is also used by replies, runs and billing.
// Preserve it when connecting an old rounded receipt to an exact WeChat ID.
export function initWechatInbox(sql: SqlStorage) {
  const columns = sql.exec<{ name: string }>("PRAGMA table_info(inbox)").toArray();
  for (const name of ["wechatRoundedId", "wechatExactId", "wechatSeq", "wechatTextReceipts"]) {
    if (!columns.some((c) => c.name === name))
      sql.exec(`ALTER TABLE inbox ADD COLUMN ${name} TEXT`);
  }
  sql.exec(
    "CREATE INDEX IF NOT EXISTS inbox_wechat_rounded ON inbox(wechatRoundedId) WHERE wechatRoundedId IS NOT NULL",
  );
}

// Keep only the last attempt for each text part. A historical row without receipts
// predates diagnostics. Never store upstream bodies, message IDs or recipient IDs here.
export function recordWechatTextReceipt(
  sql: SqlStorage,
  pending: { id: string; part: number; attempts: number },
  receipt: WechatTextReceipt | undefined,
) {
  if (!receipt) return;
  sql.exec(
    "UPDATE inbox SET wechatTextReceipts=json_set(COALESCE(wechatTextReceipts,'{}'),?,json(?)) WHERE id=?",
    `$."${pending.part}"`,
    JSON.stringify({ ...receipt, attempt: pending.attempts + 1, at: Date.now() }),
    pending.id,
  );
}

function knownSequence(seq: WxMessage["seq"]) {
  if (typeof seq === "string") return BigInt(seq) > 0n ? seq : null;
  return seq !== undefined && Number.isSafeInteger(seq) && seq > 0 ? String(seq) : null;
}

function nonzero(value: WxMessage["message_id"]) {
  return value && value !== "0" && value !== "-0" ? value : undefined;
}

export function wechatReceiptId(message: WxMessage) {
  return nonzero(message.message_id) ?? nonzero(message.seq);
}

// Old versions kept at most one row per zero spelling and sender. Keep its
// primary key because downstream replies and billing refer to the original ID.
function claimLegacyZero(
  sql: SqlStorage,
  prefix: string,
  message: WxMessage,
  replay: boolean,
  canonicalId: string,
) {
  const value = message.seq!;
  const sequence = String(value);
  const rows = sql
    .exec<{ id: string; seq: string | null; payload: string | null }>(
      "SELECT id,wechatSeq AS seq,CASE WHEN wechatSeq IS NULL THEN payload END AS payload FROM inbox WHERE id IN (?,?) AND (wechatSeq IS NULL OR wechatSeq=?)",
      prefix + "0",
      prefix + "-0",
      sequence,
    )
    .toArray();
  if (!rows.length) return false;
  const candidates = rows.map((row) => ({
    ...row,
    previous: row.seq ?? (row.payload ? (JSON.parse(row.payload) as WxMessage).seq : undefined),
  }));
  const confirmed = candidates.find(
    (row) =>
      row.previous !== undefined &&
      String(row.previous) === sequence &&
      (typeof row.previous === "string" ||
        Number.isSafeInteger(row.previous) ||
        typeof value === "number"),
  );
  // A scrubbed legacy row can only be claimed by its original spelling on
  // replay of the committed cursor. An already recorded sibling owns its ID.
  const match =
    confirmed ??
    (replay &&
      candidates.find(
        (row) =>
          row.id === prefix + message.message_id &&
          (row.payload === "{}" ||
            (typeof row.previous === "number" &&
              !Number.isSafeInteger(row.previous) &&
              row.previous === Number(value))) &&
          !sql.exec("SELECT 1 FROM inbox WHERE id=?", canonicalId).toArray().length,
      ));
  if (!match) return false;
  if (match.seq === null) {
    const large = !Number.isSafeInteger(Number(value));
    sql.exec(
      "UPDATE inbox SET wechatSeq=?,wechatRoundedId=?,wechatExactId=? WHERE id=?",
      sequence,
      large ? prefix + String(Number(value)) : null,
      large && typeof value === "string" ? value : null,
      match.id,
    );
  }
  return true;
}

/** Called inside the transaction that commits the link cursor. */
export function insertWechatMessage(
  sql: SqlStorage,
  prefix: string,
  connectionId: string,
  message: WxMessage,
  replay: boolean,
) {
  const value = wechatReceiptId(message);
  if (value === undefined) return false;
  let id = prefix + value;
  let rounded: string | null = null;
  let exact: string | null = null;
  let seq: string | null = null;
  if (!Number.isSafeInteger(Number(value))) {
    rounded = prefix + String(Number(value));
    exact = typeof value === "string" ? value : null;
    seq = knownSequence(message.seq);
    const receipts = sql
      .exec<{ id: string; exact: string | null; seq: string | null; legacyPayload: string | null }>(
        "SELECT id,wechatExactId AS exact,wechatSeq AS seq,CASE WHEN wechatRoundedId IS NULL THEN payload END AS legacyPayload FROM inbox WHERE wechatRoundedId=? OR id=?",
        rounded,
        rounded,
      )
      .toArray();
    if (exact && receipts.some((row) => row.exact === exact)) return false;
    // Only incomplete identities need a bridge. Equal floats alone do not
    // establish that two precise messages are the same.
    const candidates = receipts.filter((row) => !exact || !row.exact);
    const sequence = (row: (typeof receipts)[number]) =>
      row.seq ??
      (row.legacyPayload ? knownSequence((JSON.parse(row.legacyPayload) as WxMessage).seq) : null);
    const match =
      (seq !== null && candidates.find((row) => sequence(row) === seq)) ||
      candidates.find(
        (row) => (seq === null || sequence(row) === null) && (replay || (!exact && !row.exact)),
      );
    if (match) {
      if (exact || (!match.seq && seq))
        sql.exec(
          "UPDATE inbox SET wechatRoundedId=?,wechatExactId=COALESCE(wechatExactId,?),wechatSeq=COALESCE(wechatSeq,?) WHERE id=?",
          rounded,
          exact,
          seq,
          match.id,
        );
      return false;
    }
    if (exact) id = prefix + "wx64:" + exact;
    else if (seq !== null && receipts.some((row) => row.id === rounded))
      id = rounded + ":seq:" + seq;
  }
  if (!nonzero(message.message_id) && claimLegacyZero(sql, prefix, message, replay, id))
    return false;
  return (
    sql
      .exec(
        "INSERT OR IGNORE INTO inbox (id,payload,createdAt,connectionId,wechatRoundedId,wechatExactId,wechatSeq) VALUES (?,?,?,?,?,?,?) RETURNING id",
        id,
        JSON.stringify(message),
        Date.now(),
        connectionId,
        rounded,
        exact,
        seq,
      )
      .toArray().length > 0
  );
}
