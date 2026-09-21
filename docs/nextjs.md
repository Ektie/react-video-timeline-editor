# Next.js integration

The demo at `demo/nextjs` is the reference. Copy its pattern, not its chrome.

## 1. Install

```bash
npm install @ektie/react-video-timeline-editor
```

## 2. Client boundary

The editor uses DOM APIs. Put `next/dynamic({ ssr: false })` in a Client Component (Next.js 15 forbids `ssr: false` in Server Components). See `demo/nextjs/components/EditorHost.js`.

```jsx
"use client";
import { VideoTimelineEditor, createEmptyProject } from "@ektie/react-video-timeline-editor";
import "@ektie/react-video-timeline-editor/style.css";
```

Do not import the editor from a Server Component.

## 3. Load and persist

Hold the project document in React state. `onChange` receives the full serialized timeline:

```jsx
const [project, setProject] = useState(() => createEmptyProject({ id: "cut-1", name: "Cut" }));
<VideoTimelineEditor project={project} onChange={setProject} />
```

Save `JSON.stringify(project)` wherever you like (localStorage, your API). There is no backend in the package.

## 4. Assets

Pass `assets` (library items) and `onImportFiles` (disk uploads). Return a clip draft:

```js
{
  label: file.name,
  durationMs: 4000,
  video_url: objectUrl, // or audio_url / keyframe_url
}
```

## 5. Events and slots

- `onChange` — every committed edit
- `slots.headerEnd` — host Save/Export buttons
- `onExport` — optional; no encoder is shipped

See `demo/nextjs/components/EditorDemo.js`.
