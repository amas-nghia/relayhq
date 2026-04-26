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

1. Reproduce trước
2. Đọc error message + stack trace từ đầu đến cuối
3. Tìm root cause, không fix symptom
4. Viết failing test trước khi fix
5. Fix tối thiểu
6. Verify test pass
7. Check regression
