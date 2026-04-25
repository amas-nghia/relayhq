---
name: "Write Tests"
title: "Add regression coverage"
type: "task-template"
---

## Objective

Add targeted automated tests that catch the reported regression and prove the current flow.

## Acceptance Criteria

- New tests fail before the change
- New tests pass after the change

## Context Files

- app/server/api/
- app/server/services/

## Constraints

- Prefer focused regression coverage over broad rewrites
