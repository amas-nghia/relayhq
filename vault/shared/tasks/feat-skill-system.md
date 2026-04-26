---
id: "feat-skill-system"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "high"
title: "Build skill/plugin system for agents"
assignee: null
created_by: "@amas"
created_at: "2026-04-26T00:00:00Z"
updated_at: "2026-04-26T00:00:00Z"
heartbeat_at: null
execution_started_at: null
execution_notes: null
progress: 0
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: "pending"
blocked_reason: null
blocked_since: null
result: null
completed_at: null
parent_task_id: null
depends_on: []
tags: ["skill", "agent", "cli", "mcp"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Build skill/plugin system for agents

## Mục tiêu

Agents (Claude Code, OpenCode, v.v.) nhận được hướng dẫn chuyên sâu phù hợp với loại task đang làm — không cần PM viết lại instructions trong mỗi task. Skills là Markdown files được cài từ npm, lưu local, và tự động inject vào context khi agent claim task phù hợp.

---

## Skill file format

Mỗi skill là một file `SKILL.md` nằm trong root của npm package. Frontmatter bắt buộc:

```markdown
---
name: code-review
version: 1.0.0
description: Systematic code review checklist and reasoning guide for AI agents
requires: []
task_types:
  - code-review
  - review
  - refactor
applies_to_tags:
  - code-review
  - review
---

# Code Review Skill

Khi thực hiện code review, hãy làm theo thứ tự:

1. **Đọc toàn bộ diff trước** — không comment từng dòng ngay lập tức
2. **Kiểm tra security trước**: injection, auth bypass, secret leak
3. ...
```

Các field frontmatter:
| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `name` | string | ✅ | Unique identifier, kebab-case |
| `version` | string | ✅ | Semver |
| `description` | string | ✅ | 1 dòng mô tả |
| `requires` | string[] | ✅ | Tên các skill khác cần cài trước (có thể rỗng) |
| `task_types` | string[] | ✅ | Match với `task.type` trong vault frontmatter |
| `applies_to_tags` | string[] | optional | Match với `task.tags[]` nếu `task_types` không match |

---

## 1. CLI — `relayhq skill`

Thêm vào `scripts/relayhq.mjs` (đây là file duy nhất cần sửa cho CLI).

### 1a. `relayhq skill install <package>`

Ví dụ: `npx relayhq skill install @relayhq/skill-code-review`

Luồng xử lý:

```
1. Xác định SKILLS_DIR = path.join(os.homedir(), '.relayhq', 'skills')
2. mkdirSync(SKILLS_DIR, { recursive: true }) nếu chưa tồn tại
3. Chạy: npm pack <package> --dry-run --json để lấy danh sách files trong package
4. Thực ra: npm pack <package> trong một tmp dir
   → tạo file .tgz
5. Extract .tgz, tìm SKILL.md ở root package (package/SKILL.md trong tarball)
6. Đọc frontmatter của SKILL.md để lấy name và version
7. Lưu file vào: SKILLS_DIR/<name>@<version>.md
8. Xóa tmp dir
9. In: "✓ Installed skill: code-review@1.0.0"
```

Dùng `node:tar` hoặc chạy `tar -xzf` qua `spawnSync`. Đọc frontmatter bằng regex đơn giản (không cần thư viện yaml):

```js
function parseSkillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error('SKILL.md missing frontmatter')
  const fm = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) fm[key.trim()] = rest.join(':').trim()
  }
  // parse task_types và applies_to_tags dưới dạng YAML list
  // nếu dòng tiếp theo bắt đầu bằng "  - " thì là array
  return parseFrontmatterFull(match[1])
}
```

Nên viết helper `parseFrontmatterFull(yamlText)` trả về object với arrays parsed đúng.

Error cases cần handle:
- Package không tồn tại trên npm → `fail('Package not found: ...')`
- Package không có SKILL.md → `fail('Package has no SKILL.md at root')`
- Frontmatter thiếu required fields → `fail('SKILL.md missing required field: task_types')`
- Skill đã cài cùng version → in warning nhưng không fail: `"⚠ skill code-review@1.0.0 already installed"`

### 1b. `relayhq skill list`

In dạng bảng:

```
Installed skills  (~/.relayhq/skills/)

NAME              VERSION    DESCRIPTION
code-review       1.0.0      Systematic code review checklist
bug-fix           1.0.0      Root cause analysis guide for bug tasks
documentation     1.0.0      Docs structure and writing guide

3 skills installed. Run "npx relayhq skill install <pkg>" to add more.
```

Luồng:
1. Đọc tất cả `*.md` trong SKILLS_DIR
2. Parse frontmatter của từng file
3. In bảng với padding cố định (padEnd)
4. Nếu SKILLS_DIR không tồn tại hoặc rỗng: in "No skills installed."

### 1c. `relayhq skill remove <name>`

Ví dụ: `npx relayhq skill remove code-review`

Luồng:
1. Tìm file trong SKILLS_DIR khớp tên (bất kể version): `code-review@*.md`
2. Nếu tìm thấy → `unlinkSync`, in "✓ Removed skill: code-review"
3. Nếu không tìm thấy → `fail('Skill not installed: code-review')`

### Kết nối vào `main()` trong relayhq.mjs

```js
if (command === 'skill') {
  const subcommand = positional[0]
  if (subcommand === 'install') return cmdSkillInstall(positional.slice(1), flags)
  if (subcommand === 'list')    return cmdSkillList()
  if (subcommand === 'remove')  return cmdSkillRemove(positional.slice(1))
  fail(`Unknown skill subcommand: "${subcommand}"`)
}
```

Thêm vào `COMMANDS`:
```js
'skill install': 'Install a skill from npm',
'skill list':    'List installed skills',
'skill remove':  'Remove an installed skill',
```

---

## 2. Server — inject skills vào agent context

File cần sửa: `app/server/api/agent/context.get.ts`

### 2a. Tìm SKILLS_DIR phía server

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readdirSync, readFileSync, existsSync } from 'node:fs'

function getSkillsDir(): string {
  return process.env.RELAYHQ_SKILLS_DIR ?? join(homedir(), '.relayhq', 'skills')
}
```

### 2b. Load tất cả installed skills

```ts
interface Skill {
  name: string
  version: string
  description: string
  task_types: string[]
  applies_to_tags: string[]
  content: string   // full markdown (không có frontmatter)
}

function loadInstalledSkills(): Skill[] {
  const dir = getSkillsDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseSkillFile(readFileSync(join(dir, f), 'utf8')))
    .filter(Boolean)
}
```

### 2c. Match skills với task

```ts
function matchSkills(skills: Skill[], task: TaskFrontmatter): Skill[] {
  return skills.filter(skill => {
    const typeMatch = skill.task_types.includes(task.type ?? '')
    const tagMatch  = skill.applies_to_tags.some(t => (task.tags ?? []).includes(t))
    return typeMatch || tagMatch
  })
}
```

### 2d. Inject vào response

Response hiện tại của `/api/agent/context` trả về object có `task`, `project`, `workspace`, `audit_notes`. Thêm field `skills`:

```ts
// Trong handler GET /api/agent/context
const allSkills    = loadInstalledSkills()
const matchedSkills = matchSkills(allSkills, task)

return {
  task,
  project,
  workspace,
  audit_notes,
  skills: matchedSkills.map(s => ({
    name: s.name,
    version: s.version,
    description: s.description,
    content: s.content,   // markdown body để agent đọc
  }))
}
```

Nếu không có skill nào match: `skills: []` (không lỗi).

### 2e. Agent skill_file field (optional enhancement)

Agent registry (`vault/shared/agents/*.md`) có thể có field `skill_files: [code-review, bug-fix]`. Nếu có, load thêm các skills đó bất kể task type:

```ts
const agentSkillNames = agent?.skill_files ?? []
const agentSkills = allSkills.filter(s => agentSkillNames.includes(s.name))
const finalSkills = [...new Set([...matchedSkills, ...agentSkills])]
```

---

## 3. Starter skill packages

Tạo 3 npm packages trong thư mục `skills/` ở root repo (hoặc separate repo).

### Cấu trúc mỗi package

```
skills/
├── skill-code-review/
│   ├── package.json
│   └── SKILL.md
├── skill-bug-fix/
│   ├── package.json
│   └── SKILL.md
└── skill-documentation/
    ├── package.json
    └── SKILL.md
```

### `skill-code-review/package.json`

```json
{
  "name": "@relayhq/skill-code-review",
  "version": "1.0.0",
  "description": "Code review skill for AI agents using RelayHQ",
  "main": "SKILL.md",
  "files": ["SKILL.md"],
  "keywords": ["relayhq", "skill", "code-review"],
  "license": "MIT"
}
```

### `skill-code-review/SKILL.md` — nội dung gợi ý

```markdown
---
name: code-review
version: 1.0.0
description: Systematic code review guide for AI agents
requires: []
task_types:
  - code-review
  - review
applies_to_tags:
  - code-review
  - review
---

# Code Review Skill

## Thứ tự thực hiện

1. Đọc toàn bộ diff/changeset trước khi comment bất kỳ dòng nào
2. Kiểm tra security: injection, auth bypass, secret hardcode, path traversal
3. Kiểm tra correctness: logic, edge cases, error handling
4. Kiểm tra maintainability: naming, function size, coupling
5. Kiểm tra tests: coverage đủ không, test có test đúng behavior không

## Severity levels

- **CRITICAL**: security issue hoặc data loss risk — BLOCK, phải fix trước merge
- **HIGH**: bug rõ ràng hoặc missing error handling — cần fix
- **MEDIUM**: maintainability — nên fix
- **LOW**: style/suggestion — optional

## Output format

Trả kết quả theo dạng:

```
## Code Review: <task-title>

### Summary
<1-3 câu tổng quan>

### Issues

| Severity | File | Line | Issue |
|----------|------|------|-------|
| CRITICAL | auth.ts | 42 | SQL injection via string concat |

### Verdict
APPROVE / REQUEST_CHANGES / BLOCK
```
```

### `skill-bug-fix/SKILL.md` — nội dung gợi ý

```markdown
---
name: bug-fix
version: 1.0.0
description: Root cause analysis and fix guide for bug tasks
requires: []
task_types:
  - bug
  - fix
  - hotfix
applies_to_tags:
  - bug
  - fix
---

# Bug Fix Skill

## Quy trình

1. **Reproduce trước** — tìm cách reproduce bug từ mô tả task trước khi đọc code
2. **Đọc error message + stack trace** từ đầu đến cuối
3. **Tìm root cause** — không fix symptom, tìm nguyên nhân thực sự
4. **Viết failing test trước** khi fix (nếu có test suite)
5. **Fix tối thiểu** — không refactor xung quanh khi đang fix bug
6. **Verify test pass** sau fix
7. **Check regression**: fix này có break gì khác không?

## Khi không thể reproduce

- Ghi rõ môi trường cần để reproduce
- Set task sang `blocked` với `blocked_reason` chi tiết
- Đừng đoán và commit random changes
```

### `skill-documentation/SKILL.md` — nội dung gợi ý

```markdown
---
name: documentation
version: 1.0.0
description: Documentation writing guide for AI agents
requires: []
task_types:
  - docs
  - documentation
applies_to_tags:
  - docs
  - documentation
---

# Documentation Skill

## Nguyên tắc

- Viết cho người đọc chưa biết gì về feature này
- Mỗi section trả lời một câu hỏi cụ thể
- Code examples phải chạy được, không phải pseudocode
- Không giải thích WHAT (code đã nói rồi), giải thích WHY và HOW

## Cấu trúc docs chuẩn

1. **Overview** — feature là gì, giải quyết vấn đề gì (2-3 câu)
2. **Quick start** — example chạy được ngay trong < 5 phút
3. **How it works** — giải thích cơ chế
4. **API reference** — nếu có public API
5. **Edge cases / limitations** — những gì KHÔNG làm được

## Checklist trước khi done

- [ ] Code examples có chạy được không?
- [ ] Links có đúng không?
- [ ] Có missing prerequisites nào không?
- [ ] Đã test với người chưa biết feature này chưa?
```

---

## 4. Thêm `skill_files` vào agent registry

File: `vault/shared/agents/agent-claude-code.md` (và các agent khác)

Thêm field vào frontmatter:

```yaml
skill_files:
  - code-review
  - bug-fix
```

Agent có skill_files → server luôn inject các skills đó bất kể task type.

---

## File changes summary

| File | Action | Mô tả |
|------|--------|-------|
| `scripts/relayhq.mjs` | Sửa | Thêm `cmdSkillInstall`, `cmdSkillList`, `cmdSkillRemove`, update `main()` và `COMMANDS` |
| `app/server/api/agent/context.get.ts` | Sửa | Thêm `loadInstalledSkills()`, `matchSkills()`, inject `skills[]` vào response |
| `skills/skill-code-review/package.json` | Tạo | npm package |
| `skills/skill-code-review/SKILL.md` | Tạo | Skill content |
| `skills/skill-bug-fix/package.json` | Tạo | npm package |
| `skills/skill-bug-fix/SKILL.md` | Tạo | Skill content |
| `skills/skill-documentation/package.json` | Tạo | npm package |
| `skills/skill-documentation/SKILL.md` | Tạo | Skill content |
| `vault/shared/agents/agent-claude-code.md` | Sửa | Thêm `skill_files` field |

---

## Acceptance Criteria

- [ ] `npx relayhq skill install @relayhq/skill-code-review` → tải SKILL.md từ npm, lưu vào `~/.relayhq/skills/code-review@1.0.0.md`, in success message
- [ ] `npx relayhq skill list` → in bảng name/version/description của tất cả installed skills
- [ ] `npx relayhq skill remove code-review` → xóa file, in success; chạy lần 2 → lỗi "not installed"
- [ ] Install package không có SKILL.md → lỗi rõ ràng
- [ ] `GET /api/agent/context?taskId=<task-có-tag-code-review>` → response có `skills[0].name === "code-review"` và `skills[0].content` chứa markdown
- [ ] Task không match skill nào → `skills: []` không crash
- [ ] `~/.relayhq/skills/` không tồn tại → server không crash, trả `skills: []`
- [ ] 3 starter packages trong `skills/` directory với SKILL.md hợp lệ
- [ ] `npm pack skills/skill-code-review` thành công (để test publish readiness)

---

## Out of scope

- UI trong web/ để quản lý skills (Phase sau)
- Skill versioning conflict resolution (dùng version mới nhất đơn giản)
- Private skill registry (chỉ support public npm)
- Skill dependencies (`requires[]` parse nhưng không auto-install)
