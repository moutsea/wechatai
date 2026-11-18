import type { WxMessage } from "./wechat";

// The original inbox primary key is also used by replies, runs and billing.
// Preserve it when connecting an old rounded receipt to an exact WeChat ID.
export function initWechatInbox(sql: SqlStorage) {
  const columns = sql.exec<{ name: string }>("PRAGMA table_info(inbox)").toArray();
  for (const name of ["wechatRoundedId", "wechatExactId", "wechatSeq"]) {
    if (!columns.some((c) => c.name === name))
      sql.exec(`ALTER TABLE inbox ADD COLUMN ${name} TEXT`);
  }
  sql.exec(
    "CREATE INDEX IF NOT EXISTS inbox_wechat_rounded ON inbox(wechatRoundedId) WHERE wechatRoundedId IS NOT NULL",
  );
}

function knownSequence(seq: WxMessage["seq"]) {
  if (typeof seq === "string") return BigInt(seq) > 0n ? seq : null;
  return seq !== undefined && Number.isSafeInteger(seq) && seq > 0 ? String(seq) : null;
}

/** Called inside the transaction that commits the link cursor. */
export function insertWechatMessage(
  sql: SqlStorage,
  prefix: string,
  connectionId: string,
  message: WxMessage,
  replay: boolean,
) {
  const value = message.message_id ?? message.seq!;
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
