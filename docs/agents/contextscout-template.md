# ContextScout Prompt Template

Use ContextScout only for discovery.

It should return the smallest useful set of canonical files and a clear handoff target.

## When to use
- finding relevant files
- locating canonical docs
- identifying the next file to read
- mapping repo structure

## Do not use for
- code changes
- docs edits
- task execution
- planning beyond discovery

## Prompt template

```text
Search the repo for the smallest set of canonical files needed for: {task}

Return:
1. The top 3 files to read first
2. Why each file matters
3. Any missing context or gaps
4. The next agent to hand off to

Recommended handoff targets:
- `TaskManager` for splitting or planning
- `CoderAgent` for implementation
- `DocWriter` for docs updates
- `TestEngineer` for tests

Constraints:
- Do not change files
- Prefer canonical docs over scattered references
- Keep the answer short and actionable
- Do not continue into planning or implementation
```

## Good output shape
- file paths
- one-line reason each
- handoff suggestion

## Bad output shape
- long brainstorming
- implementation plans
- code snippets
- speculative architecture changes
