"use client";

import { useCallback, useMemo, useState } from "react";
import {
    VideoTimelineEditor,
    createEmptyProject,
} from "@ektie/react-video-timeline-editor";
import "@ektie/react-video-timeline-editor/style.css";
import { buildSampleProject, SAMPLE_ASSETS } from "../lib/sampleProject";

const STORAGE_KEY = "vte-demo-project";

function probeDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const isVideo = file.type.startsWith("video/");
        const isAudio = file.type.startsWith("audio/");
        if (!isVideo && !isAudio) {
            resolve({ url, durationMs: 3000 });
            return;
        }
        const el = document.createElement(isVideo ? "video" : "audio");
        el.preload = "metadata";
        el.onloadedmetadata = () => {
            resolve({ url, durationMs: Math.max(200, Math.round((el.duration || 3) * 1000)) });
        };
        el.onerror = () => resolve({ url, durationMs: 3000 });
        el.src = url;
    });
}

export default function EditorDemo() {
    const sample = useMemo(() => buildSampleProject(), []);
    const [project, setProject] = useState(sample);
    const [events, setEvents] = useState(() => [
        { at: Date.now(), message: "Loaded sample project" },
    ]);
    const [saveState, setSaveState] = useState("idle");

    const log = useCallback((message) => {
        setEvents((list) => [{ at: Date.now(), message }, ...list].slice(0, 12));
    }, []);

    const handleChange = useCallback((next) => {
        setProject(next);
        setSaveState("saved");
        log(`onChange — ${next.tracks?.length || 0} tracks, ${next.total_duration_ms}ms`);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* quota / private mode */
        }
    }, [log]);

    const handleImport = useCallback(async ({ files, trackType }) => {
        const file = files[0];
        if (!file) return null;
        const { url, durationMs } = await probeDuration(file);
        log(`Imported ${file.name} as ${trackType}`);
        const draft = {
            label: file.name,
            durationMs,
        };
        if (trackType === "audio" || trackType === "music") draft.audio_url = url;
        else if (trackType === "still" || file.type.startsWith("image/")) draft.keyframe_url = url;
        else {
            draft.video_url = url;
            draft.keyframe_url = url;
        }
        return draft;
    }, [log]);

    const loadStorage = () => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                log("No saved project in localStorage");
                return;
            }
            setProject(JSON.parse(raw));
            log("Loaded project from localStorage");
        } catch {
            log("Could not parse saved project");
        }
    };

    const downloadJson = () => {
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project.name || "timeline"}.json`;
        a.click();
        URL.revokeObjectURL(url);
        log("Downloaded project JSON");
    };

    const uploadJson = async (file) => {
        const text = await file.text();
        setProject(JSON.parse(text));
        log(`Loaded ${file.name}`);
    };

    return (
        <div className="demo-shell">
            <header className="demo-top">
                <div>
                    <p className="demo-kicker">Integration example</p>
                    <h1>react-video-timeline-editor</h1>
                    <p className="demo-lead">
                        This Next.js app imports <code>@ektie/react-video-timeline-editor</code>.
                        It is not the editor — it shows how a host application wires the public API.
                    </p>
                </div>
                <div className="demo-actions">
                    <button type="button" onClick={() => setProject(buildSampleProject())}>Sample project</button>
                    <button type="button" onClick={() => setProject(createEmptyProject({ id: "blank", name: "Blank" }))}>Blank project</button>
                    <button type="button" onClick={loadStorage}>Load saved</button>
                    <button type="button" onClick={downloadJson}>Download JSON</button>
                    <label className="demo-file">
                        Load JSON
                        <input type="file" accept="application/json" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadJson(file);
                        }} />
                    </label>
                </div>
            </header>

            <VideoTimelineEditor
                project={project}
                onChange={handleChange}
                assets={SAMPLE_ASSETS}
                onImportFiles={handleImport}
                aspectRatio={project.aspect_ratio}
                resolution={project.resolution}
                saveState={saveState}
                slots={{
                    headerEnd: (
                        <button type="button" className="demo-slot" onClick={downloadJson}>
                            Save JSON
                        </button>
                    ),
                }}
            />

            <aside className="demo-events" aria-label="Editor events">
                <h2>Events</h2>
                <p>Host <code>onChange</code> and import callbacks. Copy this pattern into your app.</p>
                <ol>
                    {events.map((event) => (
                        <li key={event.at + event.message}>
                            <time>{new Date(event.at).toLocaleTimeString()}</time>
                            {event.message}
                        </li>
                    ))}
                </ol>
            </aside>

            <footer className="demo-foot">
                Used in production by{" "}
                <a href="https://ektie.com/creative" rel="noreferrer">Ektie Creative</a>
                . The editor package is independently usable without that product.
            </footer>
        </div>
    );
}
