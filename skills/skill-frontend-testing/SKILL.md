---
name: frontend-testing
version: 1.0.0
description: Frontend testing guide — unit, integration, visual regression, accessibility, E2E for UI
requires: []
task_types:
  - testing
  - frontend-testing
  - qa
  - e2e
applies_to_tags:
  - testing
  - frontend
  - qa
  - playwright
  - vitest
  - cypress
---

# Frontend Testing Skill

## Thứ tự ưu tiên test

1. **E2E critical paths** — happy path của user journey quan trọng nhất
2. **Integration tests** — component với real API/state
3. **Unit tests** — utilities, hooks, pure functions
4. **Visual regression** — screenshot comparison cho UI quan trọng
5. **Accessibility audit** — automated a11y check

## Unit Test (Vitest / Jest)

### Cái gì nên unit test

- Pure utility functions (date format, validation, transform)
- Custom hooks (dùng `renderHook`)
- Complex business logic trong component
- Error boundary behavior

### Pattern

```ts
// Arrange
const input = { ... }
// Act
const result = fn(input)
// Assert
expect(result).toEqual(expected)
```

- Test behavior, không test implementation
- Mock tối thiểu — chỉ mock external services, không mock internal modules
- Tên test mô tả behavior: `"returns empty array when no results match"`

## Component / Integration Test (Testing Library)

```ts
render(<TaskCard task={mockTask} />)
// Query bằng role/label — không dùng test-id trừ khi cần
expect(screen.getByRole('heading', { name: 'Fix bug' })).toBeVisible()
await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
expect(mockClaim).toHaveBeenCalledWith(taskId)
```

### Query priority (ưu tiên từ cao xuống thấp)

1. `getByRole` — accessible name
2. `getByLabelText` — form fields
3. `getByText` — visible text
4. `getByTestId` — last resort

## E2E Test (Playwright)

### Checklist viết test

- [ ] Test happy path trước
- [ ] Dùng `page.getByRole` thay selectors CSS
- [ ] Waitfor selector/network idle thay `sleep`
- [ ] Screenshot assertion cho visual-critical pages
- [ ] Test trên mobile viewport (375px) nếu có responsive

```ts
test('user can claim a task', async ({ page }) => {
  await page.goto('/board')
  await page.getByRole('button', { name: 'Claim' }).first().click()
  await expect(page.getByText('In Progress')).toBeVisible()
})
```

### Tránh flaky tests

- Không hardcode timeout — dùng `waitForSelector` / `waitForResponse`
- Không test timing animations
- Isolate test data — mỗi test tự tạo data riêng hoặc reset state

## Visual Regression

- Screenshot các breakpoint: 375, 768, 1280, 1920
- Test cả light và dark mode nếu project có
- Chạy sau mỗi UI change đáng kể
- Review diff trước khi approve snapshot update

## Accessibility Testing

```ts
import { axe } from 'jest-axe'
const { container } = render(<Component />)
const results = await axe(container)
expect(results).toHaveNoViolations()
```

- Keyboard navigation: Tab qua tất cả interactive elements
- Screen reader test với VoiceOver (Mac) hoặc NVDA (Windows)
- Focus trap trong modal/dialog

## Coverage targets

| Loại | Minimum |
|---|---|
| Utility functions | 95% |
| Hooks | 85% |
| Components (branch) | 80% |
| Critical user paths (E2E) | 100% |

## Khi test fail

1. Reproduce locally trước khi sửa
2. Đọc error message đầy đủ
3. Kiểm tra xem test sai hay implementation sai
4. Không disable test — fix root cause
5. Nếu flaky: xác định race condition và fix bằng proper wait
