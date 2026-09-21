# Architecture

```
Host app (Next.js demo, Ektie Creative, …)
  └── VideoTimelineEditor
        ├── useTimelineEngine (undo / selection / persist revision)
        ├── TimelineClipModel (pure reducers)
        └── TimelinePlayer (browser preview)
```

The package never calls a network API. Hosts supply assets, fonts, persistence, and export.

See `packages/editor/src/index.js`.
