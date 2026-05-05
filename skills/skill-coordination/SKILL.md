---
name: coordination
version: 1.0.0
description: Multi-agent coordination skill — task decomposition, dependency tracking, handoff protocol, conflict resolution
requires: []
task_types:
  - coordination
  - orchestration
  - planning
  - dispatch
applies_to_tags:
  - coordination
  - orchestration
  - multi-agent
  - planning
  - dispatch
---

# Coordination Skill

## Vai trò của Coordinator

Coordinator không trực tiếp implement — Coordinator:
1. Phân tích yêu cầu và phân rã thành tasks rõ ràng
2. Phân công task cho đúng agent/người
3. Theo dõi tiến độ và unblock khi có vấn đề
4. Tổng hợp kết quả và báo cáo lên

## Quy trình điều phối

### Bước 1: Phân tích yêu cầu

Trước khi tạo task:
- Xác định **output cuối cùng** cần đạt được
- Liệt kê **dependencies** — cái gì phải xong trước cái gì
- Ước tính **complexity** và **risk** của từng phần
- Xác định ai/agent nào có đủ khả năng cho từng task

### Bước 2: Phân rã task

Mỗi task phải đáp ứng:
- **Atomic**: một đơn vị công việc có thể hoàn thành độc lập
- **Verifiable**: có tiêu chí rõ ràng để biết đã done
- **Sized right**: không quá nhỏ (overhead lớn) và không quá lớn (khó track)
- **Clear owner**: đúng một agent/người chịu trách nhiệm

```
# Task tốt
title: "Implement POST /api/vault/tasks endpoint"
acceptance_criteria:
  - Returns 201 với task object
  - Validates required fields (title, column)
  - Writes file vào vault/shared/tasks/
  - Unit test coverage ≥ 80%

# Task xấu  
title: "Build the backend"
```

### Bước 3: Xác định dependency graph

```
task-A ──► task-B ──► task-D
task-C ──────────────►task-D
```

- Tasks không có dependency: chạy song song
- Tasks có dependency: chạy tuần tự
- Tránh circular dependency

### Bước 4: Dispatch và monitoring

- Assign task với đầy đủ context: links, specs, examples
- Heartbeat check định kỳ (~10 phút) — đừng để agent bị block im lặng
- Unblock chủ động: nếu agent hỏi → trả lời ngay, không để pending

### Bước 5: Handoff và tổng hợp

Khi nhận kết quả từ agent:
1. Verify output có đáp ứng acceptance criteria không
2. Test smoke nhanh nếu là code/API
3. Note lại bất kỳ deviation nào từ spec
4. Tổng hợp kết quả từ nhiều agents thành coherent whole

## Xử lý blockers

| Tình huống | Hành động |
|---|---|
| Agent blocked vì thiếu info | Cung cấp ngay, update task với context mới |
| Agent blocked vì dependency chưa xong | Requeue sau khi dependency done |
| Agent conflict (hai agent cùng edit) | Dùng optimistic lock, agent sau đọc lại state mới |
| Agent fail / không respond | Unassign, reassign hoặc escalate |
| Scope creep | Reject — tạo task mới cho phần bổ sung |

## Conflict Resolution

Khi hai agents làm việc trên cùng resource:
1. Vault dùng optimistic lock (`locked_by`, `lock_expires_at`)
2. Agent sau phải đọc lại state hiện tại trước khi apply changes
3. Merge conflict trong markdown: lấy version mới hơn làm base, apply diff

## Communication protocol

- **Claim**: khi bắt đầu task → cập nhật status `in-progress`
- **Heartbeat**: mỗi 10 phút khi active → signal "còn sống"
- **Request approval**: khi cần human review → dừng, không tự tiếp tục
- **Done**: khi xong → update progress 100, cung cấp result summary

## Metrics để track

- **Cycle time**: từ `todo` đến `done` mỗi task
- **Block rate**: % tasks bị blocked / tổng tasks
- **Approval rate**: % tasks cần re-review
- **Parallel utilization**: số agents chạy song song / capacity

## Checklist trước khi dispatch

- [ ] Task có acceptance criteria rõ ràng
- [ ] Dependencies đã resolved hoặc được ghi rõ
- [ ] Agent có đủ context (links, specs, examples)
- [ ] Không có ambiguity về scope
- [ ] Đã estimate effort / deadline nếu có
