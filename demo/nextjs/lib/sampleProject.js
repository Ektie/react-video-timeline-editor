import {
    addSubtitleCue,
    addTrack,
    insertClip,
    normalizeTracks,
    serializeTracks,
    subtitlesFromTracks,
    wallClockTotalMs,
} from "@ektie/react-video-timeline-editor";

const CLIP = "/samples/clip.mp4";
const STILL = "/samples/still.png";
const VOICE = "/samples/voice.wav";

export function buildSampleProject() {
    let tracks = normalizeTracks({ tracks: [] });
    tracks = insertClip(tracks, "video-0", {
        label: "Sample clip",
        durationMs: 4000,
        video_url: CLIP,
        keyframe_url: STILL,
    }, 0);
    tracks = addTrack(tracks, "still");
    const stillRow = tracks.find((track) => track.type === "still");
    tracks = insertClip(tracks, stillRow.id, {
        label: "Sample still",
        durationMs: 2000,
        keyframe_url: STILL,
    }, 1000);
    tracks = insertClip(tracks, "audio-0", {
        label: "Sample voice",
        durationMs: 4000,
        audio_url: VOICE,
    }, 0);
    tracks = addSubtitleCue(tracks, 400, { text: "This is the sample timeline", durationMs: 2400 });

    return {
        id: "demo-sample",
        name: "Sample project",
        aspect_ratio: "9:16",
        resolution: "1080x1920",
        canvas: { backdrop: { enabled: false, mode: "color", color: "#000000" } },
        tracks: serializeTracks(tracks),
        subtitles: subtitlesFromTracks(tracks),
        total_duration_ms: wallClockTotalMs(tracks),
    };
}

export const SAMPLE_ASSETS = [
    {
        key: "clip",
        group: "Samples",
        title: "Teal clip",
        subtitle: "4s video",
        thumbnail: STILL,
        types: ["video"],
        draft: { label: "Teal clip", durationMs: 4000, video_url: CLIP, keyframe_url: STILL },
    },
    {
        key: "still",
        group: "Samples",
        title: "Amber still",
        subtitle: "Image",
        thumbnail: STILL,
        types: ["video", "still"],
        draft: { label: "Amber still", durationMs: 2000, keyframe_url: STILL },
    },
    {
        key: "voice",
        group: "Samples",
        title: "Tone",
        subtitle: "4s audio",
        thumbnail: null,
        types: ["audio", "music"],
        draft: { label: "Tone", durationMs: 4000, audio_url: VOICE },
    },
];
