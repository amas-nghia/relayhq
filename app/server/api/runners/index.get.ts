import { defineEventHandler } from "h3";
import { agentRunnerManager } from "../../services/runners/manager";

export default defineEventHandler((event) => {
  return agentRunnerManager.getRunners();
});
