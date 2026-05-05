import { createError, defineEventHandler, readBody } from "h3";

import { getRelayHQSkillDir, saveInstalledSkill } from "../../services/agents/skills";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} is required and must be a non-empty string.` });
  }

  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw createError({ statusCode: 400, statusMessage: "sourcePath must be a string when provided." });
  }
  return value.trim();
}

function readStringArray(value: unknown, field: string): ReadonlyArray<string> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be an array of strings.` });
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "skills body must be an object." });
  }

  try {
    const skill = await saveInstalledSkill({
      name: readRequiredString(body.name, "name"),
      version: readRequiredString(body.version, "version"),
      description: readRequiredString(body.description, "description"),
      requires: readStringArray(body.requires, "requires"),
      taskTypes: readStringArray(body.taskTypes, "taskTypes"),
      appliesToTags: readStringArray(body.appliesToTags, "appliesToTags"),
      content: typeof body.content === "string" ? body.content : "",
      sourcePath: readOptionalString(body.sourcePath),
    });

    return {
      skill: {
        name: skill.name,
        version: skill.version,
        description: skill.description,
        requires: skill.requires,
        sourcePath: skill.sourcePath,
        taskTypes: skill.taskTypes,
        appliesToTags: skill.appliesToTags,
        content: skill.content,
      },
      skillDir: getRelayHQSkillDir(),
    };
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "Unable to save skill.",
    });
  }
});
