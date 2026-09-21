# Host-app snippets

The Next.js demo under `demo/nextjs` is the full reference.

Minimal client usage:

```jsx
"use client";
import { useState } from "react";
import { VideoTimelineEditor, createEmptyProject } from "@ektie/react-video-timeline-editor";
import "@ektie/react-video-timeline-editor/style.css";

export default function EditorPage() {
  const [project, setProject] = useState(() => createEmptyProject({ name: "Cut" }));
  return <VideoTimelineEditor project={project} onChange={setProject} />;
}
```
