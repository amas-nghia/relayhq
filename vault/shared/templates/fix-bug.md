---
name: "Fix Bug"
title: "Fix production bug"
type: "task-template"
---

## Objective

Resolve the reported bug and preserve the existing happy path behaviour.

## Acceptance Criteria

- Bug is reproducible before the fix
- Bug is no longer reproducible after the fix
- Regression path is covered by tests

## Context Files

- app/server/api/
- web/src/pages/

## Constraints

- Do not break the current API contract
