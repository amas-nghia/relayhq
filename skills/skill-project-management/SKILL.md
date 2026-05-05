---
name: project-management
version: 1.0.0
description: Project management skill — sprint planning, backlog grooming, risk management, reporting, stakeholder communication
requires: []
task_types:
  - planning
  - project-management
  - sprint
  - backlog
  - reporting
applies_to_tags:
  - project-management
  - planning
  - sprint
  - backlog
  - milestone
  - reporting
---

# Project Management Skill

## Vai trò PM trong hệ thống agent

PM không code — PM đảm bảo **đúng việc được làm đúng lúc bởi đúng người**.

Responsibilities:
- Maintain backlog có priority rõ ràng
- Đảm bảo mỗi task có acceptance criteria trước khi vào sprint
- Unblock team, không để blocker kéo dài > 24h
- Báo cáo progress chính xác, không tô hồng
- Quản lý risk chủ động, không đợi incident xảy ra

## Vòng đời Sprint

### Sprint Planning

1. Review backlog — chỉ chọn tasks đã có acceptance criteria đầy đủ
2. Estimate effort (story points hoặc T-shirt sizing)
3. Check capacity của team/agents
4. Commit sprint goal: **một câu** mô tả kết quả sprint

```
Sprint Goal: "Users can create and assign tasks to agents through the board UI"
```

5. Tạo tasks trong vault với priority và assignee rõ ràng

### Daily Standup (async hoặc sync)

Mỗi agent/member cần cung cấp:
- Đã làm gì (kể từ lần check-in trước)
- Đang làm gì hôm nay
- Có blocker gì không

PM action: xử lý blocker ngay trong vòng họp, không để defer.

### Sprint Review

- Demo kết quả thực tế — không slideshow
- Verify từng task so với acceptance criteria
- Ghi nhận những gì chưa done và lý do
- Update velocity cho planning kỳ sau

### Sprint Retrospective

3 câu hỏi:
1. Gì làm tốt → duy trì
2. Gì chưa tốt → action item cụ thể
3. Gì thử làm khác → experiment nhỏ trong sprint tới

## Backlog Management

### Prioritization framework (RICE)

```
Score = (Reach × Impact × Confidence) / Effort
```

| Factor | Đo bằng |
|---|---|
| Reach | Số user/agent bị ảnh hưởng mỗi tháng |
| Impact | 3=massive, 2=high, 1=medium, 0.5=low |
| Confidence | % chắc về estimate (100/80/50) |
| Effort | Person-weeks |

Hoặc dùng đơn giản hơn: **MoSCoW** (Must/Should/Could/Won't this sprint)

### Backlog hygiene

- Review backlog mỗi 2 tuần — remove stale items
- Tasks không được pick lên sau 3 sprints → re-evaluate hoặc archive
- Epic phải có breakdown thành tasks ≤ 1 sprint mỗi task
- Dependency phải được ghi rõ trong task description

## Risk Management

### Risk register format

| Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Agent vault conflict | Medium | High | Optimistic lock timeout | @coordinator |
| Feature scope creep | High | Medium | Hard sprint commitment | @pm |

### Risk tracking

- Review risk register mỗi sprint
- Escalate risk level High + Probability High ngay lập tức
- Post-mortem sau mọi production incident — blameless, focus on systems

## Stakeholder Communication

### Status report (weekly)

```markdown
## Sprint N Status — Week of YYYY-MM-DD

**RAG Status:** 🟢 On Track / 🟡 At Risk / 🔴 Off Track

### This Week
- [X] Done: ...
- [~] In Progress: ... (ETA: ...)
- [ ] Planned but not started: ... (Reason: ...)

### Blockers
- [Blocker description] — Owner: @name — Expected resolution: [date]

### Next Week
- Top 3 priorities: ...

### Metrics
- Velocity: X story points
- Bug count (open/closed): X/Y
- Agent utilization: X%
```

### Khi dự án bị trễ

1. Báo cáo ngay — không đợi đến deadline
2. Đưa ra 3 options: scope cut / deadline extend / resource add
3. Để stakeholder chọn, không quyết định thay
4. Document quyết định được chọn

## Task quality gate

Trước khi task vào sprint, kiểm tra:

- [ ] Title: verb + noun, rõ ràng (`"Implement claim API"`, không phải `"API stuff"`)
- [ ] Acceptance criteria: ≥ 3 điều kiện cụ thể, measurable
- [ ] Dependency: listed và resolved hoặc scheduled
- [ ] Estimate: có rough effort estimate
- [ ] Assignee: xác định người/agent chịu trách nhiệm
- [ ] Priority: `critical` / `high` / `medium` / `low` có lý do

## Metrics quan trọng

| Metric | Mục tiêu |
|---|---|
| Sprint velocity | Stable hoặc tăng |
| Cycle time (todo → done) | < 3 ngày cho tasks thường |
| Block rate | < 20% tasks bị blocked |
| Rework rate | < 15% tasks cần redo |
| Burndown | On track vào ngày giữa sprint |

## Red flags cần escalate ngay

- Cycle time tăng đột biến > 2x baseline
- > 30% tasks bị blocked cùng lúc
- Agent không heartbeat > 30 phút trong working hours
- Sprint burndown phẳng sau ngày 3 (không progress)
- Acceptance criteria thay đổi sau khi task đã `in-progress`
