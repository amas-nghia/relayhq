import { defineEventHandler } from "h3";

import { getRelayHQSkillDir, loadInstalledSkills } from "../../services/agents/skills";

export default defineEventHandler(async () => {
  const skills = await loadInstalledSkills();
  return {
    skills: skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      requires: skill.requires,
      sourcePath: skill.sourcePath,
      taskTypes: skill.taskTypes,
      appliesToTags: skill.appliesToTags,
      content: skill.content,
    })),
    skillDir: getRelayHQSkillDir(),
  };
});
