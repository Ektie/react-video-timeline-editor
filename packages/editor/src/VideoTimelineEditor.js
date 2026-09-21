import React, { useCallback } from "react";
import TimelineEditor from "./TimelineEditor";
import { mergeProjectPatch, normalizeProject } from "./project";

/**
 * Host-facing editor. `project` is the serialized timeline document.
 */
export default function VideoTimelineEditor({
    project,
    onChange,
    assets = [],
    fonts,
    onImportFiles,
    aspectRatio,
    resolution,
    saveState,
    savedAt,
    onRetrySave,
    onExport,
    slots,
    className,
}) {
    const doc = project?.tracks ? project : normalizeProject(project);
    const handleChange = useCallback((patch) => {
        onChange?.(mergeProjectPatch(doc, patch));
    }, [doc, onChange]);

    const handleUpload = useCallback(async (file, trackType) => {
        if (!onImportFiles) return null;
        return onImportFiles({ files: [file], trackType });
    }, [onImportFiles]);

    return (
        <div className={className}>
            <TimelineEditor
                timeline={doc}
                onChange={handleChange}
                projectId={doc.id}
                projectName={doc.name}
                assets={assets}
                fonts={fonts}
                onUpload={onImportFiles ? handleUpload : null}
                aspectRatio={aspectRatio || doc.aspect_ratio}
                resolution={resolution || doc.resolution}
                saveState={saveState}
                savedAt={savedAt}
                onRetrySave={onRetrySave}
                onRender={onExport}
                slots={slots}
            />
        </div>
    );
}
