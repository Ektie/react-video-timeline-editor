# @ektie/react-video-timeline-editor

Open-source **React multi-track video timeline editor** (GNU Affero General Public License v3.0).

Embed a timeline, tracks, clips, and browser playback into your own React or Next.js app. You own the JSON project document. Persistence, media hosting, and encoding stay in the host.

This package is **not** [Ektie Creative](https://ektie.com/creative). Creative is a separate commercial production platform.

**Live demo:** [https://react-video-timeline-editor-nextjs.vercel.app](https://react-video-timeline-editor-nextjs.vercel.app)

## Install

```bash
npm install @ektie/react-video-timeline-editor
```

Peer dependencies: `react` and `react-dom` ≥ 18.

## Usage

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
    createEmptyProject({ name: "My cut" })
  );

  return (
    <VideoTimelineEditor
      project={project}
      onChange={setProject}
    />
  );
}
```

Import the editor from a Client Component. In Next.js App Router, load it with `next/dynamic({ ssr: false })` from a `"use client"` module.

There are **no environment variables**. Pass `assets` / `onImportFiles` for media, persist `onChange` JSON yourself, and hook `onExport` or `slots.headerEnd` if you encode elsewhere.

## Docs

- [Repository README](https://github.com/Ektie/react-video-timeline-editor#readme)
- [Public API](https://github.com/Ektie/react-video-timeline-editor/blob/main/docs/api.md)
- [Data model](https://github.com/Ektie/react-video-timeline-editor/blob/main/docs/data-model.md)
- [Next.js](https://github.com/Ektie/react-video-timeline-editor/blob/main/docs/nextjs.md)

## License

GNU Affero General Public License v3.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
