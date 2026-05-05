---
name: backend-testing
version: 1.0.0
description: Backend testing guide — unit, integration, API contract, database, load testing
requires: []
task_types:
  - testing
  - backend-testing
  - qa
  - api-testing
applies_to_tags:
  - testing
  - backend
  - qa
  - api
  - database
---

# Backend Testing Skill

## Thứ tự ưu tiên test

1. **Integration tests** — API endpoint với real database (highest signal)
2. **Unit tests** — service logic, utilities, transformers
3. **Contract tests** — verify API shape khớp với client expectation
4. **Load tests** — endpoints chịu tải production estimate

## Integration Test (real database)

### Nguyên tắc

- Test với real database, không mock — mock database tạo false confidence
- Mỗi test tự seed data → chạy → cleanup
- Dùng transaction rollback để isolate test cases

```ts
beforeEach(async () => {
  await db.delete(tasks)  // clean slate
  testTask = await db.insert(tasks).values(mockTask).returning()
})

test('PATCH /tasks/:id updates status', async () => {
  const res = await request(app)
    .patch(`/api/vault/tasks/${testTask.id}`)
    .send({ status: 'done' })
  expect(res.status).toBe(200)
  expect(res.body.data.status).toBe('done')
  // Verify DB was actually updated
  const row = await db.query.tasks.findFirst({ where: eq(tasks.id, testTask.id) })
  expect(row.status).toBe('done')
})
```

### Checklist endpoint test

- [ ] Happy path (200/201)
- [ ] Not found (404)
- [ ] Validation error (400) — test từng required field
- [ ] Auth error (401/403)
- [ ] Conflict nếu có (409)
- [ ] Edge cases (empty list, max pagination)

## Unit Test

### Cái gì nên unit test

- Pure transformation functions
- Validation logic
- Business rules phức tạp (không liên quan DB)
- Error mapping

### Cái gì KHÔNG unit test riêng

- Route handler (test via integration)
- Database queries (test via integration)
- External service calls (mock + integration riêng)

## Contract Test

Đặc biệt quan trọng với RelayHQ — server và web phải khớp:

```ts
// contract-alignment.test.ts pattern
test('GET /api/vault/read-model returns expected shape', async () => {
  const res = await request(app).get('/api/vault/read-model')
  expect(res.body).toMatchObject({
    tasks: expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(String),
        status: expect.any(String),
        title: expect.any(String),
      })
    ])
  })
})
```

Chạy contract tests sau mỗi thay đổi API response shape.

## Database Test

- Migration up/down phải idempotent
- Test constraint violations (unique, not null, foreign key)
- Test index effectiveness với `EXPLAIN ANALYZE`
- Seed scripts phải nhất quán và reproducible

## Load / Performance Test (k6 / autocannon)

```js
// k6 smoke test
export default function () {
  const res = http.get('http://localhost:44210/api/vault/read-model')
  check(res, { 'status 200': (r) => r.status === 200 })
  sleep(1)
}
// Target: p95 < 200ms, no errors under 50 concurrent users
```

Chạy load test trước khi ship feature có query mới.

## Mocking External Services

```ts
// Mock HTTP calls, không mock database
vi.mock('../services/external-llm', () => ({
  generateSummary: vi.fn().mockResolvedValue('mocked summary')
}))
```

- External APIs: mock ở service boundary
- File system: dùng temp directory thật
- Time: mock `Date.now()` cho time-dependent logic

## Coverage targets

| Layer | Minimum |
|---|---|
| Service / business logic | 90% |
| Route handlers | 85% (via integration) |
| Utilities / helpers | 95% |
| Migration files | manual verification |

## Khi test fail ở CI

1. Chạy locally với same env vars
2. Kiểm tra database state (dirty data từ test trước?)
3. Check race condition nếu tests chạy parallel
4. Đọc full error + stack trace — đừng skip
5. Không sửa assertion để match broken behavior
