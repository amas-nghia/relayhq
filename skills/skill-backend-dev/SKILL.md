---
name: backend-dev
version: 1.0.0
description: Backend development guide — API design, data modeling, business logic, security, performance
requires: []
task_types:
  - feature-implementation
  - backend
  - api
  - database
applies_to_tags:
  - backend
  - api
  - database
  - server
  - service
---

# Backend Development Skill

## Quy trình triển khai

1. Xác định API contract trước — request/response shape, status codes
2. Thiết kế data model — schema, relations, indexes
3. Viết service layer logic (pure business logic, không HTTP)
4. Implement route handler (thin — chỉ validate, call service, trả response)
5. Viết migration nếu thay đổi schema
6. Test endpoint với real database

## API Design

### Response envelope nhất quán

```json
{
  "data": { ... },
  "error": null,
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

### HTTP status codes

| Tình huống | Code |
|---|---|
| Thành công có data | 200 |
| Tạo mới thành công | 201 |
| Không có nội dung | 204 |
| Validation error | 400 |
| Chưa auth | 401 |
| Không có quyền | 403 |
| Không tìm thấy | 404 |
| Conflict (duplicate) | 409 |
| Server error | 500 |

### Versioning

- Dùng `/api/v1/` prefix
- Không breaking change trong cùng version
- Deprecate endpoint bằng header `Deprecated: true` trước khi remove

## Data Layer

### Query safety

- Luôn dùng parameterized query / ORM — không bao giờ string concat vào SQL
- Pagination bắt buộc cho list endpoints: `limit` max 100, default 20
- Soft delete bằng `deleted_at` timestamp thay hard delete với data quan trọng

### Transaction

```ts
// Wrap multi-step mutations trong transaction
await db.transaction(async (tx) => {
  await tx.update(tasks).set({ status: 'done' })
  await tx.insert(auditNotes).values({ ... })
})
```

### Index checklist

- [ ] Foreign key columns
- [ ] Columns thường xuyên filter/sort
- [ ] Composite index cho query phổ biến
- [ ] Không over-index — mỗi index có chi phí write

## Security (bắt buộc)

- Validate tất cả input tại route boundary (Zod, Joi, class-validator)
- Sanitize output — không leak internal fields
- Rate limiting trên tất cả public endpoints
- Auth middleware trước route handler — không inline
- `api_key_ref` phải dạng `env:VAR`, `secret:name` — không raw value
- Log request/response nhưng redact sensitive fields

## Error Handling

```ts
// Service throws typed errors
class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`)
  }
}

// Route handler catches và map sang HTTP
try {
  const result = await service.getTask(id)
  return { data: result }
} catch (e) {
  if (e instanceof NotFoundError) return sendError(event, 404, e.message)
  throw e  // let global handler deal with unexpected errors
}
```

- Không log stack trace ra response
- Log đầy đủ context ở server side (request id, user id, timestamp)

## Performance

- Avoid N+1: JOIN hoặc batch load thay vì query trong loop
- Cache kết quả expensive computation (Redis / in-memory với TTL)
- Background jobs cho tác vụ không cần sync response
- Database connection pooling — không tạo connection mới mỗi request

## Code quality checklist

- [ ] Route handler < 30 dòng
- [ ] Service function < 50 dòng; tách helper nếu cần
- [ ] Không có business logic trong migration files
- [ ] Không hardcode secrets hoặc URLs
- [ ] Tất cả external calls có timeout
- [ ] Idempotent endpoints khi có thể (đặc biệt POST tạo resource)
