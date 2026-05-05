import { defineEventHandler, getRouterParam } from "h3";

import { getProjectCoordinatorThread } from "../../../../services/vault/project-coordinator-thread";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "id") ?? "";
  return await getProjectCoordinatorThread(projectId);
});
