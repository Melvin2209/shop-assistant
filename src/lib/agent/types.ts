import type { ToolCallRecord, ToolName, ToolResult } from "@/lib/tools/tools";
import type { GroundingReport } from "./grounding";

export type AgentMode = "mock" | "real";

/** Conversation history as stored by the client: plain text only. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Events streamed from the server to the browser, one JSON object per line
 * (NDJSON). Both agents (mock and real) emit exactly the same events, so the UI
 * and the eval don't care which one is running.
 */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: ToolName; input: unknown }
  | { type: "tool_result"; id: string; name: ToolName; result: ToolResult }
  | { type: "grounding"; report: GroundingReport }
  | { type: "done"; mode: AgentMode }
  | { type: "error"; message: string };

export interface AgentRunResult {
  text: string;
  toolCalls: ToolCallRecord[];
  grounding: GroundingReport;
}
