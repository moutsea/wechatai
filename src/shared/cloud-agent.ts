/** Public task history. Never include upstream identities, credentials or raw requests. */
export type CloudAgentTaskStatus =
  | "submitting"
  | "queued"
  | "running"
  | "awaiting_approval"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type CloudAgentTask = {
  id: string;
  pluginInstanceId: string;
  pluginName: string;
  sessionId: string | null;
  sessionTitle: string;
  prompt: string;
  status: CloudAgentTaskStatus;
  upstreamStatus?: string;
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
  credits?: number;
  /** The original conversation no longer permits automatic result delivery. */
  stale?: boolean;
  delivered?: boolean;
  delivery: "pending" | "sent" | "stale" | "failed";
  stopping?: boolean;
  /** A submission attempt may exist upstream but its job id is not confirmed. */
  unconfirmed?: boolean;
};

export type CloudAgentTaskPage = {
  tasks: CloudAgentTask[];
  nextCursor: string | null;
};
