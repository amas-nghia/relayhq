import { d as defineEventHandler, a as assertMethod, g as getRouterParam, r as readBody, c as createError } from '../../../../../nitro/nitro.mjs';
import { c as claimTaskLifecycle } from '../../../../../_/task-lifecycle.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';
import 'node:fs/promises';
import '../../../../../_/write.mjs';
import '../../../../../_/runtime.mjs';

function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const claim = defineEventHandler(async (event) => {
  assertMethod(event, "POST");
  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }
  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId is required." });
  }
  return await claimTaskLifecycle({
    taskId,
    actorId: body.actorId,
    assignee: typeof body.assignee === "string" && body.assignee.trim().length > 0 ? body.assignee : void 0
  });
});

export { claim as default };
//# sourceMappingURL=claim.mjs.map
