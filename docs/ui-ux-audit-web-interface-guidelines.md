# UI/UX Audit

Audit date: 2026-04-28

Guideline source:
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`

Reviewed scope:
- `web/src/pages/DesktopView.tsx`
- `web/src/pages/AgentsView.tsx`
- `web/src/components/task/DetailPanel.tsx`
- `web/src/components/layout/Sidebar.tsx`
- `web/src/components/layout/TopBar.tsx`
- `web/src/components/layout/Shell.tsx`
- `web/src/pages/BoardView.tsx`
- `web/src/pages/TasksView.tsx`
- `web/src/components/ui/input.tsx`
- `web/src/components/ui/button.tsx`

## Summary

RelayHQ already has a clear product personality and stronger-than-average operator affordances for an AI coordination tool. The strongest parts of the UI are:
- clear domain-specific surfaces for tasks, agents, approvals, and runtime status
- solid empty states in many places
- generally strong semantic button usage for actions
- meaningful improvements in the agent runtime truth surfaces

The highest-impact gaps are not visual polish problems. They are interaction and accessibility problems:
- several icon-only controls still rely on `title` instead of `aria-label`
- multiple navigation surfaces use `button` or row click handlers instead of links
- focus styling is inconsistent and still depends on `outline-none`, `focus`, and `transition-all`
- important state is local-only instead of URL-addressable
- several chat/search controls still have no programmatic labels

If these are fixed first, the product becomes easier to operate, easier to audit, and more trustworthy under real multi-task usage.

## Project Assessment

### What is working

1. The product vocabulary is distinctive.
RelayHQ feels like a control plane rather than a generic SaaS dashboard. The runtime truth badges, approval language, session status, audit concepts, and task lifecycle language reinforce the product model.

2. The UI usually handles missing data gracefully.
Most major surfaces have explicit empty states instead of collapsing or rendering broken cards/tables.

3. The system is getting better at communicating agent/runtime boundaries.
The agent runtime truth badges and caution copy reduce one of the biggest conceptual risks in the product: users confusing an identity record with an execution-capable runtime.

### Where the experience breaks down

1. Accessibility is uneven at the edges.
Core surfaces are reasonably structured, but modal closes, chat controls, notification toggles, desktop sprites, and search/filter controls still miss baseline affordances.

2. Navigation semantics do not match user expectations in several places.
Some controls navigate but are implemented as buttons or clickable rows. That blocks normal browser behavior like middle-click, open in new tab, and better keyboard semantics.

3. State persistence is still too local.
Board lane selection and task filtering are valuable operator state, but they are not reflected in the URL. That makes collaboration, debugging, and deep-linking weaker than they should be for an operational tool.

4. The design system primitives need one accessibility pass.
The primitive `Input` and `Button` components still encode patterns the guideline explicitly warns against, so the same issues can spread across every page.

## Findings

## web/src/components/ui/input.tsx

web/src/components/ui/input.tsx:9 - `outline-none` without `focus-visible` replacement on the shared input primitive
web/src/components/ui/input.tsx:9 - `transition-all` on the shared input primitive
web/src/components/ui/input.tsx:9 - uses `focus:` styling instead of `focus-visible:`

## web/src/components/ui/button.tsx

web/src/components/ui/button.tsx:33 - `transition-all` on the shared button primitive
web/src/components/ui/button.tsx:33 - no explicit visible `focus-visible` treatment on the shared button primitive

## web/src/components/layout/Shell.tsx

web/src/components/layout/Shell.tsx:31 - missing skip link before main application content

## web/src/components/layout/Sidebar.tsx

web/src/components/layout/Sidebar.tsx:57 - image missing explicit `width` and `height`
web/src/components/layout/Sidebar.tsx:115 - navigation to project detail uses `<button>` instead of `<a>`/`<Link>`
web/src/components/layout/Sidebar.tsx:163 - icon-only notifications button missing `aria-label`
web/src/components/layout/Sidebar.tsx:175 - icon-only user/status button missing `aria-label`
web/src/components/layout/Sidebar.tsx:195 - navigation action uses inline button instead of link semantics
web/src/components/layout/Sidebar.tsx:203 - notification item navigates via button instead of link semantics
web/src/components/layout/Sidebar.tsx:244 - "View agent status" navigates via button instead of link semantics

## web/src/components/layout/TopBar.tsx

web/src/components/layout/TopBar.tsx:40 - home navigation uses `<button>` instead of `<a>`/`<Link>`
web/src/components/layout/TopBar.tsx:41 - image missing explicit `width` and `height`

## web/src/pages/BoardView.tsx

web/src/pages/BoardView.tsx:29 - active lane state is local-only and not deep-linked in the URL
web/src/pages/BoardView.tsx:145 - lane tab changes local state only instead of URL state

## web/src/pages/TasksView.tsx

web/src/pages/TasksView.tsx:78 - search, sort, and filter state are local-only and not reflected in the URL
web/src/pages/TasksView.tsx:276 - search input lacks label or `aria-label`
web/src/pages/TasksView.tsx:280 - placeholder uses `...` instead of `…`
web/src/pages/TasksView.tsx:385 - table row click drives navigation instead of using a linkable cell or row-level link target

## web/src/components/task/DetailPanel.tsx

web/src/components/task/DetailPanel.tsx:395 - icon-only close button missing `aria-label`
web/src/components/task/DetailPanel.tsx:402 - icon-only mobile close button missing `aria-label`
web/src/components/task/DetailPanel.tsx:645 - custom schedule input lacks a visible/programmatic label
web/src/components/task/DetailPanel.tsx:662 - recurring cron input lacks a visible/programmatic label
web/src/components/task/DetailPanel.tsx:702 - comment textarea relies on placeholder instead of explicit label
web/src/components/task/DetailPanel.tsx:742 - rejection textarea relies on placeholder instead of explicit label

## web/src/pages/AgentsView.tsx

web/src/pages/AgentsView.tsx:522 - inline chat input lacks label or `aria-label`
web/src/pages/AgentsView.tsx:561 - icon-only dialog close button missing `aria-label`
web/src/pages/AgentsView.tsx:672 - loading copy uses `Saving...` instead of `Saving…`
web/src/pages/AgentsView.tsx:707 - icon-only chat dialog close button missing `aria-label`
web/src/pages/AgentsView.tsx:751 - chat follow-up input lacks label or `aria-label`
web/src/pages/AgentsView.tsx:839 - loading copy uses `Saving...` instead of `Saving…`

## web/src/pages/DesktopView.tsx

web/src/pages/DesktopView.tsx:257 - settings input uses `outline-none` without `focus-visible` replacement
web/src/pages/DesktopView.tsx:372 - API key input uses `outline-none` without `focus-visible` replacement
web/src/pages/DesktopView.tsx:693 - desktop agent sprite button uses `outline-none` without visible focus replacement
web/src/pages/DesktopView.tsx:783 - image missing explicit `width` and `height`
web/src/pages/DesktopView.tsx:865 - in-app chat input lacks label or `aria-label`

## Themes

### Accessibility baseline is not yet systemic

Most issues come from repeated patterns rather than isolated mistakes. That means the most efficient fix is to update the shared primitives and a few high-traffic surfaces, not to do one-off cleanup page by page.

### Navigation semantics need to match the product's operational workflow

RelayHQ is an operator tool. Deep links, open-in-new-tab behavior, and keyboard predictability matter more here than in a toy dashboard. Button-based navigation and clickable rows work visually but weaken serious usage.

### The UI is informative, but not always addressable

The app shows useful state, but it does not always preserve or share it. URL-sync for task filters, board lane selection, and potentially selected agent/task surfaces would make the tool more collaborative and debuggable.

### The visual system is coherent, but interaction quality trails behind it

The visual language is already distinct. The next leap in quality will come from accessibility, URL state, and semantic interaction fixes rather than another round of purely cosmetic redesign.

## Recommended Backlog

### P0

1. Add `focus-visible` styles to `Button`, `Input`, and `Textarea`, and remove `transition-all` from shared primitives.
2. Add `aria-label` to every icon-only control in agents, task detail, sidebar footer, and similar modal/window chrome.
3. Replace button-based navigation with `NavLink`/`Link` where the user is actually navigating.
4. Replace row-click navigation in `TasksView` with a proper link target while preserving the table layout.
5. Add labels or `aria-label` to search, chat, schedule, recurrence, comment, and reject inputs.

### P1

1. Add a skip link at app shell level and confirm the main content landmark is the primary focus target.
2. Sync `TasksView` search, filters, and sorting to the URL.
3. Sync `BoardView` active lane to the URL.
4. Normalize ellipsis copy from `...` to `…` across loading and placeholder strings.
5. Add explicit `width` and `height` to non-decorative inline images.

### P2

1. Audit all remaining `navigate(...)` button paths and convert navigational ones to links.
2. Standardize relative and absolute date formatting behind shared `Intl.DateTimeFormat` helpers for consistency.
3. Review high-density operator screens for line-clamping, truncation, and `min-w-0` hardening in narrow layouts.
4. Evaluate whether agent/task/session selection state should also become deep-linkable.

## Suggested Task Breakdown

1. `Accessibility primitives pass`: fix shared `Button`, `Input`, and `Textarea` focus and transition behavior.
2. `Icon control audit`: add `aria-label` coverage to icon-only controls across pages and dialogs.
3. `Navigation semantics pass`: convert button-based navigation to links and remove clickable row anti-patterns.
4. `Form labeling pass`: add programmatic labels to search, chat, schedule, recurrence, and moderation inputs.
5. `URL state pass`: deep-link task filters and board lane selection.
6. `Copy consistency pass`: normalize ellipsis and compact operator copy across UI surfaces.
7. `Image stability pass`: add explicit dimensions and loading strategy where applicable.

## Recommended Order

1. Fix shared primitives first.
2. Fix navigational semantics next.
3. Fix labels and icon-only controls after that.
4. Then add URL state.
5. Do copy and image cleanup last.

That order delivers the biggest trust and usability gain with the smallest amount of repeated work.
