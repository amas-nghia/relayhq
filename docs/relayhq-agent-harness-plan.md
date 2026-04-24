# RelayHQ Agent Harness Plan

## Mục tiêu

Biến RelayHQ thành một **headless coordination backend** để các runtime như `Claude`, `OpenCode`, `Antigravity` có thể làm việc với cùng một control plane.

User có thể:
- chạy RelayHQ nền
- không cần mở UI
- đưa một prompt chuẩn cho Claude / OpenCode / Antigravity
- để agent tự lấy context dự án, tự tạo/chia task, tự claim/update/approval
- mở UI khi muốn quan sát tiến trình hoặc can thiệp thủ công

Nguyên tắc:
- RelayHQ là **control plane**
- Agent runtime là **client**
- Vault là **source of truth**
- UI là **optional**
- Prompt chỉ dạy **protocol**, không giữ project state

---

## Vấn đề hiện tại

Hiện tại các runtime:
- không biết active workspace/project/task là gì
- không biết cần nạp context nào
- không biết task nào phù hợp với mình
- không biết protocol làm việc với RelayHQ
- không có tool adapter thống nhất
- vẫn phải tự search repo và tự rebuild context từ đầu

Kết quả:
- execution không ổn định
- approval/lock dễ bị bỏ qua
- context bị lặp lại
- thay runtime rất khó

---

## User Flow mục tiêu

### Flow A: User nhờ Claude lập kế hoạch

User nói:

> Claude, lập kế hoạch cho feature X

Claude sẽ:
1. gọi RelayHQ để lấy current context
2. đọc project/board/task hiện có
3. tránh trùng task đang mở
4. sinh task proposals theo schema RelayHQ
5. ghi task vào RelayHQ
6. báo lại tóm tắt cho user

Kết quả:
- task list được ghi vào vault
- dependencies rõ ràng
- priorities rõ ràng
- suggested assignee/runtime rõ ràng

### Flow B: User nhờ OpenCode làm tiếp

User nói:

> OpenCode, làm tiếp việc đang chờ

OpenCode sẽ:
1. gọi RelayHQ để lấy task phù hợp
2. claim task
3. lấy bootstrap pack
4. đọc file liên quan
5. làm việc
6. heartbeat định kỳ
7. request approval nếu cần
8. update result / done / blocked

Kết quả:
- task chuyển trạng thái trong RelayHQ
- vault task cập nhật
- approval/audit được lưu đúng

### Flow C: Human review / approval

Khi agent request approval:
1. RelayHQ đánh task `waiting-approval`
2. tạo approval record
3. dừng execution flow tại đó

User có thể:
- mở UI hoặc dùng CLI/API
- approve / reject

Agent runtime có thể poll/check lại và tiếp tục.

---

## Kiến trúc tổng thể

### A. RelayHQ Background Service

Vai trò:
- giữ canonical state
- expose API/CLI
- quản lý lock / approval / audit
- tạo bootstrap/context packs

### B. Agent-facing Contract

Một bề mặt chuẩn để mọi runtime dùng được:
- Claude planner
- OpenCode executor
- Antigravity executor

Tất cả cùng gọi một contract giống nhau.

### C. Prompt Packs

Prompt riêng cho từng role:
- planner
- executor
- reviewer (optional)

Prompt chỉ dạy:
- phải gọi tool nào
- phải tuân protocol nào
- phải update state ra sao

### D. Optional UI

Chỉ để:
- xem board
- approve/reject
- quan sát
- override thủ công

---

## Module cần làm

## 1. Headless Agent API

### Mục tiêu

Cho agent runtimes làm việc hoàn toàn không cần UI.

### Endpoints tối thiểu

#### Context / discovery
- `GET /api/agent/context`
- `GET /api/agent/projects`
- `GET /api/agent/tasks`
- `GET /api/agent/tasks/:id`
- `GET /api/agent/bootstrap/:taskId`

#### Mutation
- `POST /api/agent/tasks/create`
- `POST /api/agent/tasks/claim`
- `POST /api/agent/tasks/heartbeat`
- `POST /api/agent/tasks/update`
- `POST /api/agent/tasks/request-approval`

#### Search
- `POST /api/agent/search-context`

### Kết quả cần đạt

- Claude/OpenCode không cần hiểu internal vault layout
- chỉ cần gọi stable API

### Deliverables

- API spec v1
- typed request/response
- error contract
- tests

---

## 2. Planner Entrypoint

### Mục tiêu

Cho Claude tự lập task list từ yêu cầu user.

### Capability

- lấy current context
- đọc open tasks hiện tại
- sinh task list mới
- ghi vào RelayHQ

### API / command gợi ý

- `POST /api/agent/plan`
- hoặc CLI: `relayhq plan "feature request"`

### Input

- user request
- optional project id
- optional workspace id

### Output

- proposed task list
- persisted tasks
- summary for user

### Required schema

Mỗi task ít nhất phải có:
- title
- objective
- acceptance criteria
- constraints
- dependencies
- task type
- suggested runtime/assignee

### Deliverables

- planner endpoint
- task proposal schema
- task creation integration
- tests

---

## 3. Task Bootstrap API

### Mục tiêu

Cho executor nhận đủ context để làm việc ngay.

### Endpoint

- `GET /api/agent/bootstrap/:taskId?agentId=...`

### Bootstrap response nên có

- task metadata
- objective
- acceptance criteria
- constraints
- workspace summary
- project summary
- board summary
- related tasks
- related approvals
- related files
- recommended files to read first
- required skills
- execution instructions
- allowed tools
- approval policy

### Kết quả cần đạt

Runtime không còn phải:
- tự search repo từ đầu
- tự đoán file nào liên quan
- tự đoán protocol

### Deliverables

- bootstrap service
- bootstrap endpoint
- task/file/context resolution logic
- tests

---

## 4. RelayHQ Tool Adapter

### Mục tiêu

Tạo một tool surface thống nhất cho mọi runtime.

### Tool contract v1

- `relayhq_get_context`
- `relayhq_list_tasks`
- `relayhq_get_task`
- `relayhq_create_tasks`
- `relayhq_claim_task`
- `relayhq_heartbeat_task`
- `relayhq_update_task`
- `relayhq_request_approval`
- `relayhq_get_bootstrap`
- `relayhq_search_context`

### Transport

- primary: HTTP API
- fallback: CLI adapter

### Kết quả cần đạt

Claude/OpenCode/Antigravity đều dùng cùng bề mặt.

### Deliverables

- adapter library
- CLI bridge
- machine-readable docs
- tests

---

## 5. Prompt Packs

### Mục tiêu

Dạy runtime cách dùng RelayHQ.

### 5.1 Planner prompt

Nội dung chính:
- luôn lấy current context trước
- không invent project state
- không trùng task nếu đã có
- task phải theo schema RelayHQ
- nếu chia nhỏ, phải set dependency rõ

### 5.2 Executor prompt

Nội dung chính:
- list or receive task from RelayHQ
- claim trước khi làm
- lấy bootstrap pack
- heartbeat định kỳ
- request approval nếu cần
- done -> update result

### 5.3 Reviewer prompt (optional)

- đọc task/result/audit
- kiểm tra acceptance criteria
- approve/reject với lý do

### Deliverables

- `claude-planner.md`
- `opencode-executor.md`
- `antigravity-executor.md`
- docs usage examples

---

## 6. Agent Profile Pack

### Mục tiêu

Cho RelayHQ biết runtime/agent nào hợp task nào.

### Schema tối thiểu

- `id`
- `name`
- `role`
- `persona`
- `capabilities`
- `task_types_accepted`
- `approval_required_for`
- `cannot_do`
- `preferred_skills`
- `tool_policy`
- `default_instructions`

### Nơi lưu

- `vault/shared/agents/*.md`

### Mục tiêu sử dụng

- matching
- bootstrap shaping
- skill selection

### Deliverables

- schema
- validator TS/Go
- read model
- seed agent records

---

## 7. Skill Loader

### Mục tiêu

Tự resolve đúng instruction docs cho task/agent.

### Resolution order đề xuất

1. task-type skill
2. agent preferred skills
3. workspace/project-specific docs
4. global fallback docs

### Output

- ordered skill/context list
- explanation vì sao chọn

### Deliverables

- loader service
- resolution rules
- explainability
- unit tests

---

## Thứ tự triển khai hợp lý

### Phase 1: Headless contract trước
1. Headless Agent API
2. Planner Entrypoint
3. Task Bootstrap API

Lý do:
- giải quyết ngay câu hỏi “agent biết RelayHQ kiểu gì?”
- giải quyết câu hỏi “agent lấy context kiểu gì?”
- giải quyết câu hỏi “agent ghi task kiểu gì?”

### Phase 2: Runtime usability
4. Tool Adapter
5. Prompt Packs

Lý do:
- để Claude/OpenCode có thể dùng API một cách thật sự thuận tiện

### Phase 3: Intelligence / routing
6. Agent Profile Pack
7. Skill Loader

Lý do:
- đây là phần optimize/hardening
- không cần làm trước để flow cơ bản chạy được

---

## Kế hoạch theo milestone / PR

### Milestone 1: Planner lane

#### PR 1
- `POST /api/agent/context`
- `POST /api/agent/search-context`
- `POST /api/agent/plan`
- task proposal schema
- task persistence

**DoD**
- Claude có thể lập task từ feature request và ghi vào RelayHQ

### Milestone 2: Executor lane

#### PR 2
- `GET /api/agent/tasks`
- `GET /api/agent/bootstrap/:taskId`
- `POST /claim`
- `POST /heartbeat`
- `POST /update`
- `POST /request-approval`

**DoD**
- OpenCode có thể lấy task và làm end-to-end

### Milestone 3: Runtime adapter

#### PR 3
- tool adapter lib
- HTTP + CLI bridge
- machine-readable contract docs

**DoD**
- runtime nào cũng có thể tích hợp với RelayHQ

### Milestone 4: Prompt packs

#### PR 4
- Claude planner prompt
- OpenCode executor prompt
- Antigravity executor prompt

**DoD**
- user chỉ cần copy/paste prompt là runtime biết cách làm việc với RelayHQ

### Milestone 5: Matching / skills

#### PR 5
- agent profile schema
- skill loader
- deterministic resolution
- UI surfacing if needed

**DoD**
- assignment/context selection có logic rõ ràng, ít hardcode

---

## Tests cần có

### Planner tests
- feature request -> task proposals
- duplicate open tasks are not recreated blindly
- generated tasks satisfy schema
- dependencies persist correctly

### Bootstrap tests
- bootstrap contains required context
- related files deterministic
- missing task -> 404
- wrong workspace/task mismatch handled

### Tool adapter tests
- list/claim/update/request approval all work
- errors normalized
- runtime gets stable payloads

### Prompt integration tests
- planner prompt produces schema-valid tasks
- executor prompt follows claim-before-work
- approval path is obeyed

### End-to-End tests
- Claude plan -> tasks appear in RelayHQ
- OpenCode claim -> bootstrap -> update -> done
- approval shows in UI and via API
- audit trail is preserved

---

## Những gì không làm trong kế hoạch này

Không đưa vào phase hiện tại:
- chat channels
- voice
- canvas
- daemon orchestration kiểu OpenClaw
- full multi-channel gateway
- sandboxing phức tạp
- direct runtime writes vào vault files

---

## Khuyến nghị cuối

Nếu muốn bắt đầu đúng hướng, nên bắt đầu ngay bằng 3 thứ:

1. `POST /api/agent/plan`
2. `GET /api/agent/bootstrap/:taskId`
3. `relayhq_*` tool adapter contract

Ba thứ này sẽ biến RelayHQ từ:
- board + vault app

thành:
- **agent coordination harness thực sự**

---

## Phản biện và điều chỉnh kế hoạch

Phần trên đúng về hướng kỹ thuật, nhưng vẫn có một số điểm chưa đủ thực tế nếu mục tiêu là:

- user chỉ cần cài RelayHQ
- đưa prompt chuẩn cho Claude / OpenCode
- rồi agent có thể tự làm việc với RelayHQ mà không phải cấu hình thủ công quá nhiều

### 1. Kế hoạch đang quá API-first, chưa đủ user-flow-first

Kế hoạch phía trên ưu tiên:
- Headless Agent API
- Planner Entrypoint
- Task Bootstrap API
- Tool Adapter

Điều đó hợp lý về mặt backend, nhưng chưa trả lời rõ user sẽ bắt đầu từ đâu.

Trong thực tế user sẽ hỏi:
- Tôi phải đưa prompt nào cho Claude?
- OpenCode gọi RelayHQ bằng gì?
- Runtime biết endpoint và protocol kiểu gì?

**Điều chỉnh đề xuất:**

Ưu tiên phải là:
1. prompt package
2. CLI/tool contract
3. bootstrap/context
4. rồi mới đến API planner phức tạp hơn

Nói cách khác, không nên chỉ bắt đầu từ backend API, mà phải bắt đầu từ **entrypoint mà runtime thật sự dùng**.

### 2. Planner Entrypoint có thể là overkill quá sớm

Kế hoạch đề xuất `POST /api/agent/plan`, nhưng phase đầu chưa chắc cần endpoint chuyên biệt như vậy.

Claude hoàn toàn có thể:
- lấy context qua tool
- tự đề xuất task list
- gọi `create_tasks`

mà không cần thêm một planner endpoint riêng.

**Điều chỉnh đề xuất:**

Phase đầu nên ưu tiên các primitive composable:
- `get_context`
- `list_tasks`
- `create_tasks`
- `get_bootstrap`
- `claim/update/request-approval`

Planner endpoint có thể để phase sau, khi flow cơ bản đã ổn.

### 3. Skill Loader đang bị đưa vào hơi sớm

Skill Loader là một abstraction tốt, nhưng nếu:
- bootstrap chưa ổn
- tool adapter chưa ổn
- runtime prompt chưa ổn

thì skill loader chỉ làm tăng độ phức tạp.

**Điều chỉnh đề xuất:**

Skill Loader nên bị đẩy lùi ra phase sau, sau khi đã có ít nhất một flow chạy thật:
- Claude tạo task
- OpenCode thực thi task

Nếu flow đó chưa chạy, skill loader là premature abstraction.

### 4. Agent Profile Pack có nguy cơ bị thiết kế quá tay

Schema gợi ý ban đầu khá rộng:
- persona
- capabilities
- preferred skills
- tool policy
- default instructions
- task_types_accepted
- approval_required_for
- cannot_do

Điều này dễ dẫn tới:
- schema quá nặng
- seed data phức tạp
- effort đổ vào metadata nhiều hơn flow thật

**Điều chỉnh đề xuất:**

Phase đầu chỉ nên giữ profile tối thiểu:
- `id`
- `name`
- `role`
- `capabilities`
- `task_types_accepted`
- `approval_required_for`

Các trường như:
- `persona`
- `preferred_skills`
- `tool_policy`
- `default_instructions`

nên để phase sau.

### 5. Headless Agent API và Tool Adapter đang overlap

Nếu không cẩn thận, ta sẽ có ba lớp rất giống nhau:
- service logic
- HTTP API
- CLI/tool adapter

**Điều chỉnh đề xuất:**

Chọn rõ primitive:
- **service layer là canonical**
- HTTP là adapter mỏng
- CLI là adapter mỏng

Không nên xem API và adapter là hai module hoàn toàn tách biệt nếu chúng chỉ đang bọc cùng một logic.

### 6. Chưa tách đủ rõ planning lane và execution lane

Đây là thiếu sót quan trọng.

#### Planning lane
- lấy project context
- tạo/sửa/chia task
- không claim execution lock

#### Execution lane
- claim task
- lấy bootstrap
- heartbeat
- done / request approval

Nếu không tách rõ, Claude planner rất dễ chạm nhầm execution state, hoặc executor tự split task ngoài kế hoạch.

**Điều chỉnh đề xuất:**

Phải ghi rõ ngay từ đầu là có hai contract khác nhau:
1. planner contract
2. executor contract

Không nên gộp cả hai vào một “agent API” mơ hồ.

### 7. Chưa làm rõ prompt được phân phối thế nào

Kế hoạch nói tới “prompt packs”, nhưng chưa quyết định rõ:
- prompt là file docs tĩnh?
- hay RelayHQ sẽ xuất prompt động?

**Điều chỉnh đề xuất:**

Nên ưu tiên prompt được xuất động từ RelayHQ, ví dụ:
- `relayhq prompt planner`
- `relayhq prompt executor --task <id>`

Như vậy user flow sẽ thực dụng hơn rất nhiều so với việc yêu cầu user tự copy file docs thủ công.

### 8. Chưa xác định rõ smallest useful slice

Kế hoạch đầy đủ, nhưng chưa chỉ ra rõ “phiên bản nhỏ nhất có giá trị thật” là gì.

**Điều chỉnh đề xuất:**

MVP harness nên chỉ gồm:
- `relayhq context`
- `relayhq tasks`
- `relayhq create-tasks`
- `relayhq bootstrap <taskId>`
- `relayhq claim`
- `relayhq heartbeat`
- `relayhq update`
- `relayhq request-approval`
- `relayhq prompt planner`
- `relayhq prompt executor`

Chỉ cần vậy là đã đủ để:
- Claude plan
- OpenCode execute
- UI remain optional

Các phần khác để phase sau.

---

## Thứ tự triển khai được điều chỉnh

Nếu viết lại theo hướng thực tế hơn, thứ tự nên là:

### Phase 0: Execution contract first
- canonical service layer
- CLI wrappers:
  - `context`
  - `tasks`
  - `create-tasks`
  - `bootstrap`
  - `claim`
  - `heartbeat`
  - `update`
  - `request-approval`

### Phase 1: Prompt distribution
- `relayhq prompt planner`
- `relayhq prompt executor`
- docs cho Claude/OpenCode

### Phase 2: Runtime integration
- prove:
  - Claude can plan
  - OpenCode can execute

### Phase 3: UI observability polish
- assign / run / observe

### Phase 4: Agent profiles
- minimal schema only

### Phase 5: Skill resolution
- only after the real flow works

---

## Revised recommendation

Giữ lại các ý tưởng cốt lõi:
- RelayHQ là headless coordination backend
- UI optional
- runtime là client
- bootstrap/context là bắt buộc
- tool contract là bắt buộc

Nhưng nên đổi thứ tự ưu tiên:
1. **Canonical service layer**
2. **CLI/tool contract**
3. **Prompt distribution**
4. **Bootstrap**
5. **Planner + executor integration**
6. **Minimal agent profile**
7. **Skill loader later**

Nói ngắn gọn:
- đừng bắt đầu bằng planner endpoint chuyên biệt
- đừng đẩy skill loader lên sớm
- đừng thiết kế agent profile quá to ngay từ đầu
- phải tách planner lane và executor lane
- phải coi prompt distribution là first-class feature
