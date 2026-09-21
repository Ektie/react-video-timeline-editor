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
| `slots.headerStart` / `slots.headerEnd` | Host controls |

## Headless

`useTimelineEngine`, `normalizeTracks`, `serializeTracks`, `moveClips`, `trimClip`, `splitAt`, `insertClip`, `TimelinePlayer`, `createEmptyProject`.
