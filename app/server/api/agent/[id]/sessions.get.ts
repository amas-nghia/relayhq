import { defineEventHandler, getRouterParam } from "h3";

import { agentRunnerManager } from "../../../services/runners/manager";

export default defineEventHandler((event) => {
  const agentId = getRouterParam(event, "id") ?? "";
  return agentRunnerManager.getAgentRunners(agentId);
});
