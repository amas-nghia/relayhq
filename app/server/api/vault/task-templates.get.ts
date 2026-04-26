import { defineEventHandler } from "h3";

import { listTaskTemplates } from "../../services/vault/task-templates";

export default defineEventHandler(async () => {
  return {
    data: await listTaskTemplates(),
    error: null,
  };
});
