# Customization

v1 extension points:

- **Asset library** — `assets` + `onImportFiles`
- **Fonts** — `fonts` (string families); preview loads Google Fonts CSS
- **Export** — `onExport` or `slots.headerEnd` (no bundled encoder)
- **Slots** — `headerStart`, `headerEnd`
- **Passthrough fields** on clips (ids, roles, custom metadata)

Do not fork the package internals for product features. Wrap it.
