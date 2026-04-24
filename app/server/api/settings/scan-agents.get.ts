import { defineEventHandler } from "h3";

import { scanAgentTools } from "../../services/agents/discovery";

export interface ScanAgentsResponse {
  readonly discovered: Awaited<ReturnType<typeof scanAgentTools>>;
}

export async function scanAgents(options: Parameters<typeof scanAgentTools>[0] = {}): Promise<ScanAgentsResponse> {
  return { discovered: await scanAgentTools(options) };
}

export default defineEventHandler(async () => await scanAgents());
