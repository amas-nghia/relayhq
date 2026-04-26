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
