import { defineEventHandler, getRouterParam } from "h3";
import { agentRunnerManager } from "../../services/runners/manager";

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "runner id is required" });
  }

  const success = agentRunnerManager.stopRunner(id);
  
  if (!success) {
    throw createError({ statusCode: 404, statusMessage: "Runner not found or already stopped" });
  }

  return { success: true };
});
