import { createError, defineEventHandler, readBody } from "h3";

import { createTaskTemplate } from "../../services/vault/task-templates";

export { createTaskTemplate };

export default defineEventHandler(async (event) => {
  try {
    return await createTaskTemplate(await readBody(event));
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw createError({
        statusCode: Number((error as { statusCode: number }).statusCode),
        statusMessage: String((error as { statusMessage?: string; message?: string }).statusMessage ?? (error as { message?: string }).message ?? "Unable to create task template."),
      });
    }
    throw error;
  }
});
