import {
    normalizeCanvas,
    normalizeTracks,
    serializeTracks,
    subtitlesFromTracks,
    wallClockTotalMs,
    canvasPadMs,
    wallClockWithCanvas,
} from "./TimelineClipModel.js";

export function createEmptyProject({
    id = "untitled",
    name = "Untitled",
    aspectRatio = "9:16",
    resolution = "1080x1920",
} = {}) {
    const tracks = normalizeTracks({ tracks: [] });
    const canvas = normalizeCanvas(null);
    return {
        id,
        name,
        aspect_ratio: aspectRatio,
        resolution,
        canvas,
        tracks: serializeTracks(tracks),
        subtitles: [],
        total_duration_ms: wallClockWithCanvas(tracks, canvas),
    };
}

export function normalizeProject(project = {}) {
    const tracks = normalizeTracks(project);
    const canvas = normalizeCanvas(project.canvas);
    return {
        id: project.id || "untitled",
        name: project.name || "Untitled",
        aspect_ratio: project.aspect_ratio || "9:16",
        resolution: project.resolution || "1080x1920",
        canvas,
        tracks: serializeTracks(tracks),
        subtitles: subtitlesFromTracks(tracks),
        total_duration_ms: wallClockWithCanvas(tracks, canvas),
    };
}

export function mergeProjectPatch(project, patch = {}) {
    const canvas = patch.canvas ?? project?.canvas;
    const tracks = patch.tracks ?? project?.tracks;
    const next = {
        ...project,
        ...patch,
        canvas,
        tracks,
        subtitles: patch.subtitles ?? project?.subtitles,
    };
    if (typeof patch.total_duration_ms === "number") {
        next.total_duration_ms = patch.total_duration_ms;
    } else if (tracks) {
        const normalized = normalizeTracks({ tracks });
        next.total_duration_ms = wallClockTotalMs(normalized) + canvasPadMs(normalizeCanvas(canvas));
    }
    return next;
}
