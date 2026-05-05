---
name: frontend-dev
version: 1.0.0
description: Frontend development guide — UI implementation, component architecture, state management, performance
requires: []
task_types:
  - feature-implementation
  - frontend
  - ui
  - component
applies_to_tags:
  - frontend
  - ui
  - react
  - vue
  - component
  - styling
---

# Frontend Development Skill

## Quy trình triển khai UI

1. Đọc design spec / mockup trước khi viết bất kỳ code nào
2. Xác định component boundary — tách UI thành các mảnh nhỏ, độc lập
3. Xây dựng từ dưới lên: atom → molecule → organism → page
4. Wire state và data sau khi UI skeleton đã render đúng
5. Kiểm tra responsive (320px → 1920px) trước khi đánh dấu done

## Component Architecture

### Nguyên tắc tách component

- Mỗi component làm đúng một việc
- Props chỉ chứa data cần thiết để render — không pass toàn bộ object
- Tách presentational (render) khỏi container (data logic)
- Compound component khi nhiều sub-component chia sẻ state

### Naming

- Component: `PascalCase` (`TaskCard`, `DetailPanel`)
- Hooks: `use` prefix (`useTaskList`, `useScrollPosition`)
- Event handlers: `handle` prefix (`handleSubmit`, `handleClose`)
- CSS classes: kebab-case hoặc utility classes

## State Management

| Loại state | Đặt ở đâu |
|---|---|
| Server data (fetch/cache) | React Query / SWR |
| Global UI state | Zustand / Jotai |
| URL-shareable state | search params |
| Form state | React Hook Form |
| Local ephemeral | `useState` |

**Không** copy server state vào global store — dùng cache của query library.

## Performance checklist

- [ ] Images có `width` + `height` explicit
- [ ] `loading="lazy"` cho ảnh below-the-fold
- [ ] Dynamic import cho heavy component / library
- [ ] Memoization (`useMemo`, `useCallback`) chỉ khi đo được bottleneck
- [ ] Không animate `width`/`height`/`top`/`left` — chỉ `transform` + `opacity`
- [ ] `key` prop stable, không dùng index làm key cho danh sách có thứ tự thay đổi

## Accessibility (bắt buộc)

- Semantic HTML: `<button>` thay `<div onClick>`, `<nav>`, `<main>`, `<article>`
- `aria-label` khi text không đủ mô tả
- Focus management sau modal open/close
- Color contrast ≥ 4.5:1 (text thường), ≥ 3:1 (large text)
- Keyboard navigable: Tab, Enter, Escape

## Anti-patterns cần tránh

- `dangerouslySetInnerHTML` không sanitize
- Side effects trong render function
- Fetch trong component mà không có loading/error state
- Magic numbers trong CSS — dùng design tokens
- Inline styles cho layout — dùng CSS class
- `!important` trừ khi không còn cách nào khác

## Code quality checklist

- [ ] Component < 200 dòng; nếu hơn thì tách
- [ ] Không có `console.log` còn sót
- [ ] PropTypes hoặc TypeScript types đầy đủ
- [ ] Error boundary bao các section quan trọng
- [ ] Storybook story (nếu project dùng) cho component mới
