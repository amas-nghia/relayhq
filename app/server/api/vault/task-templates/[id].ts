import { assertMethod, createError, defineEventHandler, getRouterParam } from "h3";

import { deleteTaskTemplate } from "../../../services/vault/task-templates";

export default defineEventHandler(async (event) => {
  assertMethod(event, "DELETE");

  const templateId = getRouterParam(event, "id");
  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: "Template id is required." });
  }

  return await deleteTaskTemplate(templateId);
});
