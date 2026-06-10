export function validateIncomingMessage(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (typeof msg.type !== "string") return false;

  switch (msg.type) {
    case "hello":
      if (msg.payload && typeof msg.payload !== "object") return false;
      break;
    case "register":
      if (msg.token && typeof msg.token !== "string") return false;
      if (msg.nonce && typeof msg.nonce !== "string") return false;
      if (msg.timestamp && typeof msg.timestamp !== "string" && typeof msg.timestamp !== "number") return false;
      break;
    case "heartbeat":
    case "pong":
    case "ping":
    case "hello_ack":
      break;
    case "tool_call":
      if (msg.requestId === undefined || msg.requestId === null) return false;
      if (!msg.payload || typeof msg.payload !== "object") return false;
      if (typeof msg.payload.name !== "string") return false;
      if (msg.payload.args && typeof msg.payload.args !== "object") return false;
      break;
    case "tool_result":
      if (msg.responseToRequestId === undefined || msg.responseToRequestId === null) return false;
      if (!msg.payload || typeof msg.payload !== "object") return false;
      break;
    default:
      return false;
  }
  return true;
}
