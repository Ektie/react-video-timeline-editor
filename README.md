# react-video-timeline-editor

**An open-source React video timeline editor for building powerful video editing experiences into your own applications.**

Build professional video editing into React and Next.js products: multi-track timeline, clips, playback, and a JSON project document you own.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

This repository is **not** [Ektie Creative](https://ektie.com/creative). It is the embeddable editor. Ektie Creative is a separate commercial product for teams that want a complete AI-powered creative production platform rather than a component to ship themselves.

| | Open-source editor | [Ektie Creative](https://ektie.com/creative) |
| --- | --- | --- |
| What it is | React NLE you embed | End-to-end creative production SaaS |
| Who it is for | Developers building a product | Teams that need films, stills, and campaign creative shipped |
| You get | Timeline, tracks, clips, preview, JSON | Studio pipeline, AI generation, brand context, managed infra |

**Live demo:** [react-video-timeline-editor-nextjs.vercel.app](https://react-video-timeline-editor-nextjs.vercel.app)

**Docs:** [API](docs/api.md) · [Data model](docs/data-model.md) · [Architecture](docs/architecture.md) · [Next.js](docs/nextjs.md) · [Customization](docs/customization.md)

**Local demo:** `npm run demo` → [http://localhost:3005](http://localhost:3005)

---

## What is this?

`@ektie/react-video-timeline-editor` is a **multi-track nonlinear editor (NLE)** implemented in React. You mount it in your app, pass a project document, and receive edits through `onChange`. There is no backend, no auth, and no required environment variables.

**Who it is for.** Product engineers who need an editing surface inside a SaaS, an internal tool, or an AI video wrapper — without writing a timeline from scratch.

**What problem it solves.** Tracks, clip geometry, trim/split/move, undo, captions, and a browser preview are a large, specialized UI. This package is that infrastructure. You keep persistence, media hosting, encoding, and product chrome.

```text
Your React / Next.js application
            ↓
   @ektie/react-video-timeline-editor
            ↓
 Timeline · tracks · clips · assets · playback
```

The package is licensed under the **GNU Affero General Public License v3.0**. You may use it commercially; if you distribute the editor or offer a modified version as a network service, AGPL-3.0 requires you to provide the corresponding source.

---

## Open-source editor vs Ektie Creative

Two different products.

- The **open-source editor** is editing infrastructure. You embed it, host it, and build your own workflows around the JSON document.
- **[Ektie Creative](https://ektie.com/creative)** is a complete creative production platform: briefs → concepts → stills and films through Creative Studio, brand context, a media library, and (when you connect them) Demand and Sales so creative is judged by what converts — not only what looks finished.

Neither is a trial of the other. The editor is not a limited demo of Ektie Creative. Ektie Creative is not “the editor plus a license key.”

| Capability | Open-source editor | Ektie Creative |
| --- | --- | --- |
| React multi-track timeline | Yes | Yes (product editing surface) |
| Video, stills, voice, music, captions | Yes | Yes |
| Trim, split, move, undo/redo, playback | Yes | Yes |
| Embed in *your* application | Yes | No |
| AGPL-3.0, self-host the editor | Yes | No |
| JSON project you persist anywhere | Yes | Hosted projects and library |
| Bundled encoder / cloud render | No — you plug `onExport` | Yes (managed production) |
| Film production pipeline (concept → stages → ship) | No | Yes |
| Story / storyboard-style production | No | Yes |
| AI video and UGC-style films | No | Yes |
| AI stills and campaign assets | No | Yes |
| Brand-aware generation | No | Yes |
| Competitor ad remix | No | Yes |
| Shared media library for GTM | No | Yes |
| Managed SaaS infrastructure | No | Yes |

### Why use Ektie Creative?

Use this package when you want a **video editing foundation** with full control: your UI, your storage, your encoder, your AI.

Use [Ektie Creative](https://ektie.com/creative) when you do **not** want to build the rest of the production system: concepting, story development, storyboards, AI generation, brand context, staged production, a media library, and the loop into campaigns.

> **Use the open-source editor when you want to build your own video editing product. Use Ektie Creative when you want the complete AI-powered creative production system.**

### Need more than a timeline?

If you want a complete AI-powered creative production platform rather than an embeddable editor, see **Ektie Creative**.

**Create videos. Generate assets. Build stories. Automate production.**

**[Explore Ektie Creative →](https://ektie.com/creative)**

---

## Key features

Implemented in this repository:

- Multi-track timeline: video, stills, voice, music, captions, zoom, spotlight
- Browser preview with aspect presets (`9:16`, `4:5`, `1:1`, `16:9`)
- Clip move, trim, split, nudge, ripple delete, edge snap
- Drag on the board; magnetic snap to clip edges and the playhead
- Selection, undo/redo, timeline zoom / fit
- Clip speed (UI presets `1` / `1.5` / `2` / `3`)
- Dissolve between abutted clips (`transition_out`)
- Picture-in-picture and split-screen on picture clips
- Source crop, zoom punch-in/out, spotlight
- Canvas backdrop, intro, and outro plates
- Captions with host-supplied font families (preview loads Google Fonts CSS)
- Host asset library + local file import via `onImportFiles`
- JSON serialize / hydrate (`onChange` emits the full document)
- Header slots for host Save / Export chrome
- CSS variables for accent and surface colors

**Not in this package:** encoding/export (no ffmpeg, no wasm encoder), networking, auth, AI generation, collaboration, or a plugin/command API.

---

## Demo

**Live:** [https://react-video-timeline-editor-nextjs.vercel.app](https://react-video-timeline-editor-nextjs.vercel.app)

`demo/nextjs` is a **host application**. It is not the editor. It shows how a Next.js App Router app imports `@ektie/react-video-timeline-editor`.

```bash
git clone <this-repository>
cd react-video-timeline-editor
npm install
npm run demo
```

Open [http://localhost:3005](http://localhost:3005). Root `npm run demo` runs `next dev --port 3005` in `demo/nextjs`.

The demo covers:

- Loading a sample project (local `/samples/` media — not from Ektie storage)
- Blank project via `createEmptyProject`
- Asset library items (`assets`) and disk import (`onImportFiles`)
- Editing on the board (select, split, play, zoom)
- `onChange` event log
- Save/load through `localStorage` and download/upload of project JSON
- A `slots.headerEnd` “Save JSON” control

Reference files: `demo/nextjs/components/EditorDemo.js`, `demo/nextjs/components/EditorHost.js`.

There is **no `.env`**. The editor does not read environment variables.

---

## Quick start

Peer dependencies: **React 18+** and **react-dom**.

```bash
npm install @ektie/react-video-timeline-editor
```

Until the package is published to npm, depend on this repo’s workspace package (`packages/editor`) or a `file:` / git URL.

### React (client)

```jsx
"use client";

import { useState } from "react";
import {
  VideoTimelineEditor,
  createEmptyProject,
} from "@ektie/react-video-timeline-editor";
import "@ektie/react-video-timeline-editor/style.css";

export default function Editor() {
  const [project, setProject] = useState(() =>
    createEmptyProject({ id: "cut-1", name: "My cut" })
  );

  return (
    <VideoTimelineEditor
      project={project}
      onChange={setProject}
    />
  );
}
```

### Next.js App Router

The editor uses the DOM. Do not import it from a Server Component. Next.js 15 also forbids `ssr: false` on `next/dynamic` in Server Components — put the dynamic import in a client module (see `demo/nextjs/components/EditorHost.js`).

```jsx
"use client";

import dynamic from "next/dynamic";

const EditorDemo = dynamic(() => import("./Editor"), { ssr: false });

export default function EditorHost() {
  return <EditorDemo />;
}
```

Full walkthrough: [docs/nextjs.md](docs/nextjs.md).

---

## How it works

```text
Host app
  └── VideoTimelineEditor          // public component
        ├── project / onChange     // JSON document in, JSON document out
        ├── assets / onImportFiles // your library and uploads
        ├── fonts / slots / onExport
        ├── useTimelineEngine      // undo, selection, persist revision
        ├── TimelineClipModel      // pure reducers (testable, no React)
        └── TimelinePlayer         // browser preview only
```

1. **Project state** lives in the host (`useState`, your store, your API). The package does not write to disk or the network.
2. **Tracks** are typed rows (`video`, `still`, `audio`, `subtitle`, `music`, `zoom`, `spotlight`). Picture rows (video + still) are a z-stack; `video-0` is the occupying spine.
3. **Clips** are timed items on a row. Media clips use `position` + source `in`/`out` + `speed`. Captions, zoom, and spotlight use absolute `in`/`out`.
4. **Assets** are host objects. The picker never fetches your CMS; you pass `assets` and resolve uploads in `onImportFiles`.
5. **Playback** is an in-browser composite of `<video>` / `<audio>` / images. It is a preview, not a renderer.
6. **Export** is a host concern. `onExport` and `slots.headerEnd` are hooks. No encoder ships in the package.

Headless helpers are exported for hosts that want to mutate documents without mounting the UI: `normalizeTracks`, `serializeTracks`, `moveClips`, `trimClip`, `splitAt`, `insertClip`, `createEmptyProject`, `useTimelineEngine`, `TimelinePlayer`.

---

## Project model

`onChange` receives a serialized document. This is what you persist.

```json
{
  "id": "cut-1",
  "name": "Product walkthrough",
  "aspect_ratio": "9:16",
  "resolution": "1080x1920",
  "canvas": {
    "backdrop": { "enabled": false, "mode": "color", "color": "#000000" }
  },
  "tracks": [
    {
      "id": "video-0",
      "type": "video",
      "items": [
        {
          "position": 0,
          "in": 0,
          "out": 4000,
          "speed": 1,
          "label": "Hook",
          "video_url": "https://cdn.example/clip.mp4",
          "keyframe_url": "https://cdn.example/poster.png",
          "transition_out": { "type": "dissolve", "duration_ms": 250 }
        }
      ]
    },
    {
      "id": "audio-0",
      "type": "audio",
      "items": [
        {
          "position": 0,
          "in": 0,
          "out": 4000,
          "speed": 1,
          "label": "VO",
          "audio_url": "https://cdn.example/voice.wav"
        }
      ]
    },
    {
      "id": "subtitle-0",
      "type": "subtitle",
      "items": [
        { "in": 400, "out": 2800, "text": "Ship the cut from JSON." }
      ]
    }
  ],
  "subtitles": [{ "in": 400, "out": 2800, "text": "Ship the cut from JSON." }],
  "total_duration_ms": 4000
}
```

`createEmptyProject({ id, name, aspectRatio, resolution })` returns a valid empty board (required rows, default `9:16` / `1080x1920`).

**Media clip fields:** `position` (timeline start, ms), `in` / `out` (source trim, ms), `speed` (wall duration is `(out - in) / speed`), `video_url` / `audio_url` / `keyframe_url`. Optional: `transition_out`, `pip`, `split`, `source_crop`. Unknown keys round-trip.

**Cue clips** (subtitle, zoom, spotlight): absolute `in` / `out`. Zoom/spotlight also use `rect: { x, y, w, h }` in 0–1 of the picture (not letterbox bars).

**Assets** you pass into the picker:

```js
{
  key: "clip-1",
  group: "Library",
  title: "Teal clip",
  subtitle: "4s video",
  thumbnail: "/samples/still.png",
  types: ["video"],
  draft: {
    label: "Teal clip",
    durationMs: 4000,
    video_url: "/samples/clip.mp4",
    keyframe_url: "/samples/still.png",
  },
}
```

`onImportFiles({ files, trackType })` should return a clip draft (`label`, `durationMs`, and `video_url` / `audio_url` / `keyframe_url`). Blob URLs are fine; serve remote media with CORS if you need filmstrips/waveforms.

Details: [docs/data-model.md](docs/data-model.md).

---

## `VideoTimelineEditor` props

| Prop | Role |
| --- | --- |
| `project` | Serialized timeline document |
| `onChange` | Called with the next full document after a committed edit |
| `assets` | Library items for the media picker |
| `onImportFiles` | `{ files, trackType }` → clip draft |
| `fonts` | Caption font family names (default list in the package) |
| `aspectRatio` / `resolution` | Preview frame (falls back to `project`) |
| `saveState` / `savedAt` / `onRetrySave` | Host save status chrome |
| `onExport` | Optional export action — **no encoder inside the package** |
| `slots.headerStart` / `slots.headerEnd` | Host controls in the toolbar |
| `className` | Wrapper class |

`slots.toolbarExtra`, `slots.contextMenuExtra`, and `slots.emptyState` appear in the TypeScript definitions but are **not wired** in the current UI. Do not rely on them yet.

---

## Customization and extensibility

v1 extension points (wrap the package; do not fork internals for product features):

- **Asset library** — `assets` + `onImportFiles`
- **Fonts** — `fonts` (string families); preview injects Google Fonts CSS
- **Persistence** — `onChange`; store JSON wherever you like
- **Export** — `onExport` or `slots.headerEnd`
- **Chrome** — `slots.headerStart`, `slots.headerEnd`
- **Theming** — CSS variables on `:root` (`--vte-accent`, `--card`, `--muted`, `--border`, `--foreground`, `--background`, …)
- **Passthrough fields** on clips (ids, roles, metadata survive serialize/hydrate)

**Not available:** a plugin system, custom track types, custom clip renderers, or a public command bus. Keyboard shortcuts (Space, `S` split, ⌘Z / Ctrl+Z, arrows, `+`/`-` zoom, Delete) are built into the editor, not a host API.

See [docs/customization.md](docs/customization.md).

---

## Use cases

Embed the editor when you are building:

- A video creation or AI-video SaaS (you supply generation + encode)
- Social / UGC / marketing video tools
- Education or course-authoring products
- Internal production consoles
- Product-demo or digital-signage builders
- Collaboration products (you supply presence and storage)

The editor is the timeline. Your application is the product.

---

## Ektie Creative as a reference

[Ektie Creative](https://ektie.com/creative) is **one** product built around this class of editing technology. You are not required to use it.

```text
Open-source video editor
        ↓
Reusable editing infrastructure
        ↓
You build your own product

                or

Open-source video editor
        ↓
Ektie Creative
        ↓
AI-powered creative production platform
```

---

## Repository layout

```text
packages/editor     @ektie/react-video-timeline-editor (the library)
demo/nextjs         Next.js App Router host (reference integration)
docs/               API, data model, architecture, Next.js, security audit
examples/           Minimal host snippet
```

---

## Development

**Requirements:** Node.js **18.18+** (Next.js 15 demo), npm **7+** (workspaces).

```bash
npm install          # hoist workspaces
npm test             # packages/editor node:test suite
npm run demo         # Next.js demo at http://localhost:3005
npm run build        # Vite build of the editor package
npm run pack:editor  # npm tarball of @ektie/react-video-timeline-editor
npm run security-scan
```

There is no repo-level lint or `tsc` script today. Types live in `packages/editor/src/index.d.ts`.

Editor code belongs in `packages/editor`. `demo/nextjs` should only consume the public API.

---

## Contributing

External contributions are welcome.

1. Fork the repository and create a branch from the default branch.
2. Keep changes in `packages/editor` unless you are improving the demo or docs.
3. Do not add credentials, `.env` files, customer media, or private host URLs.
4. Run `npm test`. Run `npm run security-scan` if you copied code or comments from another tree.
5. Open a pull request with a short description of *why* the change exists.

Bug reports and feature requests: open an issue with reproduction steps (editor version, browser, a **synthetic** project JSON — no customer media).

Coding expectations: match nearby style; prefer pure reducers in `TimelineClipModel.js` for edit math; keep the demo a consumer, not a second copy of the NLE.

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Roadmap

**Available now** — embeddable NLE, JSON document, Next.js reference demo, AGPL-3.0.

**Planned (this repository)**

- npm publish of `@ektie/react-video-timeline-editor`
- Completer TypeScript types for tracks/clips
- Wire or remove unused `slots.*` declarations
- Host-side export *examples* (your encoder, not a bundled encoder runtime)

**Not planned here:** AI generation, storyboards, managed render farms, or Ektie Creative’s production pipeline. Those belong in host applications (including Ektie Creative).

---

## Security

The editor needs **zero environment variables**. Do not copy secrets into this repo.

Report vulnerabilities **privately** (GitHub security advisory once the repo is public, or a private message to the maintainers). Do not file a public issue with exploit details.

Audit notes for maintainers: [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).

---

## License

Licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The package depends on `lucide-react` (ISC). Caption preview may load stylesheet URLs from Google Fonts at runtime; those fonts are not vendored in this repository.

No extra field-of-use restrictions are added beyond AGPL-3.0.
