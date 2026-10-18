# Public API

## `VideoTimelineEditor`

| Prop | Role |
|------|------|
| `project` | Serialized timeline document |
| `onChange` | Persist hook; receives the next document |
| `assets` | Library items for the picker |
| `onImportFiles` | `{ files, trackType }` → clip draft |
| `fonts` | Subtitle font family names |
| `aspectRatio` / `resolution` | Preview frame |
| `saveState` / `savedAt` / `onRetrySave` | Host save chrome |
| `onExport` | Optional export action |
| `slots.headerStart` / `slots.headerEnd` / `slots.toolbarExtra` / `slots.contextMenuExtra` / `slots.emptyState` | Host controls / toolbar extra / context menu / empty state |

## Headless

`useTimelineEngine`, `normalizeTracks`, `serializeTracks`, `moveClips`, `trimClip`, `splitAt`, `insertClip`, `TimelinePlayer`, `createEmptyProject`.
