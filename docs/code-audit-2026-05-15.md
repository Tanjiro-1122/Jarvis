# Jarvis Code Audit — 2026-05-15

## Summary
Jarvis builds successfully, and the backend/API layer is not the immediate cause of the iPhone Safari rendering issues. The primary instability is in the frontend layout layer.

## Confirmed stack
- Next.js App Router
- React 19
- No Tailwind
- No shadcn/ui
- No framer-motion
- Main UI is concentrated in `components/chat.tsx`
- Styling is concentrated in `app/globals.css`

## Key findings

### 1. CSS patch accumulation
`app/globals.css` had grown to 4,517 lines with many layered historical patches. The audit found:
- 1,498 `!important` declarations
- 50 `workspace-app` references
- 55 `context-sidebar` references
- 20 `.messages` references
- 26 `.input-form` references
- 41 `overflow: hidden` declarations
- 35 `backdrop-filter` declarations
- Mixed `100vh`, `100dvh`, `100svh`, and fixed-position rules

This created contradictory layout behavior between desktop Chrome and iPhone Safari.

### 2. Monolithic chat component
`components/chat.tsx` is over 3,200 lines and currently contains:
- workspace drawer
- chat header
- message rendering
- composer
- tools drawer
- memory panel
- repo control
- deploy health
- build intelligence
- activity log
- file/artifact/task panels

This is functional, but hard to safely style and debug.

### 3. iPhone Safari viewport conflict
The screenshots match known mobile Safari problems caused by:
- fixed panels inside clipped ancestors
- competing scroll containers
- mixed viewport units
- overlays relying on desktop drawer assumptions

### 4. Tools drawer layout
The tools drawer was structurally present, but styling made it behave like a squeezed desktop panel on mobile.

### 5. Login contrast
Login reused chat input styling and became dark-on-dark after earlier theme changes.

## Patch 36 action
Patch 36 replaces the accumulated CSS stack with one clean layout authority while preserving the React logic.

## Recommended next refactor
After UI stabilization, split `components/chat.tsx` into focused components:
- `MessageList`
- `Composer`
- `WorkspaceDrawer`
- `ToolsPanel`
- `MemoryPanel`
- `RepoControlPanel`

Do this after the current UI is visually stable, not during emergency layout repair.
