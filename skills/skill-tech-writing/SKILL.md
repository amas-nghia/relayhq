---
name: tech-writing
version: 1.0.0
description: Technical writing and documentation skill — specs, runbooks, changelogs, meeting notes, ADRs
requires: []
task_types:
  - docs
  - documentation
  - tech-writing
  - spec
  - changelog
  - runbook
applies_to_tags:
  - docs
  - documentation
  - spec
  - changelog
  - runbook
  - adr
  - meeting-notes
---

# Technical Writing Skill

## Nguyên tắc cốt lõi

- Viết cho người đọc chưa biết gì về context
- Mỗi đoạn trả lời **một câu hỏi cụ thể**
- Code examples phải chạy được ngay, không phải pseudocode
- Cấu trúc theo nhu cầu đọc: từ overview → detail, không ngược lại
- Ngắn gọn hơn luôn tốt hơn — không thêm từ để "có vẻ đầy đủ"

## Loại tài liệu và template

### 1. Technical Spec / PRD

```markdown
# Feature: [Tên feature]

## Problem
[Vấn đề hiện tại là gì? Ai bị ảnh hưởng?]

## Proposed Solution
[Giải pháp đề xuất — 1-3 câu]

## Requirements
### Must Have
- [ ] ...
### Nice to Have
- [ ] ...

## Design / Architecture
[Sơ đồ hoặc mô tả data flow, API contract]

## Out of Scope
[Cái gì KHÔNG nằm trong feature này]

## Open Questions
- [ ] Question 1 → [assigned to] [deadline]
```

### 2. API Documentation

```markdown
## POST /api/vault/tasks

Tạo task mới trong vault.

**Request Body**
| Field | Type | Required | Description |
|---|---|---|---|
| title | string | ✓ | Tiêu đề task |
| column | string | ✓ | `todo` / `in-progress` / `review` / `done` |
| priority | string | | `critical` / `high` / `medium` / `low` |

**Response 201**
```json
{ "data": { "id": "task-abc123", "title": "...", "status": "todo" } }
```

**Errors**
- `400` — Missing required fields
- `409` — Task with same title exists in column
```

### 3. Runbook

```markdown
# Runbook: [Tên sự cố / procedure]

## Trigger
[Khi nào dùng runbook này]

## Impact
[Ảnh hưởng tới gì nếu không xử lý]

## Steps
1. [Bước cụ thể với lệnh exact]
   ```bash
   pm2 restart relayhq-api
   ```
2. [Verify bằng cách nào]
   ```bash
   curl http://localhost:44210/api/health
   ```

## Rollback
[Cách undo nếu cần]

## Escalation
[Khi nào cần leo thang, ai là người tiếp nhận]
```

### 4. Architecture Decision Record (ADR)

```markdown
# ADR-NNN: [Tiêu đề quyết định]

**Date:** YYYY-MM-DD  
**Status:** Proposed / Accepted / Deprecated

## Context
[Tình huống đặt ra vấn đề — facts, không opinion]

## Decision
[Quyết định cụ thể đã chọn]

## Rationale
[Tại sao chọn option này — trade-offs được acknowledge]

## Alternatives Considered
- **Option A**: [mô tả] — rejected vì [reason]
- **Option B**: [mô tả] — rejected vì [reason]

## Consequences
- Positive: ...
- Negative: ...
- Neutral: ...
```

### 5. Meeting Notes / Sprint Summary

```markdown
# [Meeting type] — YYYY-MM-DD

**Attendees:** @alice, @bob, @claude-code  
**Duration:** 30 min

## Decisions Made
- [Decision với context ngắn]

## Action Items
| Task | Owner | Due |
|---|---|---|
| Implement X | @alice | 2026-05-01 |
| Review PR #123 | @bob | EOD |

## Parking Lot
[Vấn đề chưa giải quyết, cần follow-up]
```

### 6. Changelog / Release Notes

```markdown
## [1.2.0] — YYYY-MM-DD

### Added
- Agent auto-launch khi task được assign
- Visual sprite cho agent trong DesktopView

### Changed
- Claim API nay trả về full task object thay vì chỉ ID

### Fixed
- Race condition khi 2 agents claim cùng lúc

### Removed
- Legacy `/api/v1/assign` endpoint (deprecated từ 1.0.0)
```

## Quality Checklist

- [ ] Title đủ mô tả không cần đọc body
- [ ] Không có jargon chưa được giải thích
- [ ] Code examples đã được test chạy được
- [ ] Links trỏ đến đúng file/URL
- [ ] Không có TODO chưa resolved trong docs published
- [ ] Ngày tháng và version numbers chính xác
- [ ] Cross-reference với docs liên quan

## Những lỗi thường gặp

- Viết WHAT code làm thay vì WHY thiết kế như vậy
- Dùng "simply", "just", "obviously" — người đọc không thấy đơn giản đâu
- Docs chỉ update khi có incident — cần update cùng với code change
- Thiếu ví dụ cụ thể — abstract description không đủ
- Quá dài — nếu đọc mất hơn 5 phút thì chia nhỏ
