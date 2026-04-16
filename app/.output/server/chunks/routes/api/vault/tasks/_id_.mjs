import { d as defineEventHandler, a as assertMethod, g as getRouterParam, r as readBody, c as createError } from '../../../../nitro/nitro.mjs';
import { p as patchTaskLifecycle } from '../../../../_/task-lifecycle.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';
import 'node:fs/promises';
import '../../../../_/write.mjs';
import '../../../../_/runtime.mjs';

function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const _id_ = defineEventHandler(async (event) => {
  assertMethod(event, "PATCH");
  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }
  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0 || !isPlainRecord(body.patch)) {
    throw createError({ statusCode: 400, statusMessage: "actorId and patch are required." });
  }
  return await patchTaskLifecycle({
    taskId,
    actorId: body.actorId,
    patch: body.patch
  });
});

export { _id_ as default };
//# sourceMappingURL=_id_.mjs.map
