import { defineEventHandler, readBody } from "h3";
import { agentRunnerManager } from "../../services/runners/manager";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  if (!body.agentName || !body.provider || !body.prompt) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: agentName, provider, prompt"
    });
  }

  const runnerInfo = agentRunnerManager.startRunner({
    agentName: body.agentName,
    taskId: body.taskId,
    provider: body.provider,
    prompt: body.prompt
  });

  return runnerInfo;
});
