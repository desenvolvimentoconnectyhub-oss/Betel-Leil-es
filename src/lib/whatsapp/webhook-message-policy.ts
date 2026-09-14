type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const flag = (value: unknown): boolean | null => [true,1,"true","1"].includes(value as string) ? true : [false,0,"false","0"].includes(value as string) ? false : null;

export function webhookMessagePolicy(payload: unknown) {
  const root = record(payload);
  const data = Object.keys(record(root.data)).length ? record(root.data) : root;
  const event = text(root.event || root.EventType || root.eventType || data.EventType || data.event || data.eventType).toLowerCase();
  // Chat snapshots, ACKs, presence and history are not new messages, even if
  // their last-message summary says AudioMessage or contains a phone number.
  if (!["messages", "message"].includes(event)) return { kind: "control", reason: "non_message_event" } as const;
  const message = record(data.message);
  const key = record(message.key);
  const id = text(message.messageid || message.messageId || message.messageID || key.id || message.id);
  if (!Object.keys(message).length || !id) return { kind: "unknown", reason: "missing_message_identity" } as const;
  const fromMe = [message.fromMe,message.isFromMe,key.fromMe,data.fromMe,data.isFromMe].map(flag);
  const api = [message.wasSentByApi,message.fromApi,message.sentByApi,data.wasSentByApi,data.fromApi].map(flag);
  const direction = text(message.direction || data.direction).toLowerCase();
  const sender = text(message.sender_pn || message.senderPhone);
  const owner = text(message.owner || data.owner || root.owner).replace(/\D/g, "");
  const senderPhone = sender.includes("@lid") ? "" : sender.split("@")[0].replace(/\D/g, "");
  if (fromMe.includes(true) || api.includes(true) || direction === "outbound" || direction === "outgoing"
      || (owner.length >= 10 && senderPhone === owner)) return { kind: "outbound", reason: "own_message" } as const;
  if (fromMe.includes(false) || ["inbound","incoming"].includes(direction)) return { kind: "inbound", reason: "received_message" } as const;
  return { kind: "unknown", reason: "ambiguous_message_direction" } as const;
}

// Message quotes remain available separately as quotes; their text, media and
// direction must never become the current message's text, media or author.
export function currentMessageContent(value: unknown): Row {
  const row = record(value);
  return Object.fromEntries(Object.entries(row).filter(([key]) =>
    !["quoted","quotedmessage","quotedreply","contextinfo","chat"].includes(key.toLowerCase())
  ).map(([key,value]) => [key, value && typeof value === "object" && !Array.isArray(value) ? currentMessageContent(value) : value]));
}

export function messageUsableForRuntime(row: Row) {
  const payload = record(row.payload);
  if (payload.runtime_excluded === true) return false;
  if (row.direction === "system") return false;
  if (row.direction === "inbound" && (payload.event || record(payload.data).EventType)) {
    return webhookMessagePolicy(payload).kind === "inbound";
  }
  return true;
}
