/**
 * Synthetic serialize → hydrate → serialize fixture for the Cuts clip contract.
 *
 * URLs and ids are fake. Do not replace this with customer/CDN payloads.
 *
 * Run: npm run test:cs-gate
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    normalizeTracks,
    serializeTracks,
    subtitlesFromTracks,
    wallClockTotalMs,
} from "../src/TimelineClipModel.js";

const FIXTURE = {
    id: "synthetic-timeline",
    canvas: {
        backdrop: { enabled: true, mode: "color", color: "#111111" },
        intro: { image_url: "https://cdn.example/intro.jpg", duration_ms: 1000 },
        outro: { image_url: "https://cdn.example/outro.jpg", duration_ms: 1000 },
    },
    tracks: [
        {
            id: "zoom-0",
            type: "zoom",
            items: [{
                in: 400,
                out: 1600,
                rect: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
                transition_ms: 250,
            }],
        },
        {
            id: "spotlight-0",
            type: "spotlight",
            items: [{
                in: 800,
                out: 2000,
                rect: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
            }],
        },
        {
            id: "still-1",
            type: "still",
            items: [{
                position: 500,
                in: 0,
                out: 1500,
                label: "Overlay still",
                keyframe_url: "https://cdn.example/still.jpg",
                pip: { enabled: true, corner: "br", size: 0.33 },
                item_key: "overlay-a",
                visual_role: "pip_overlay",
            }],
        },
        {
            id: "video-0",
            type: "video",
            items: [
                {
                    position: 0,
                    in: 200,
                    out: 2200,
                    speed: 1,
                    label: "Spine A",
                    video_url: "https://cdn.example/a.mp4",
                    keyframe_url: "https://cdn.example/a.jpg",
                    scene_id: 11,
                    frame_id: 21,
                    transition_out: { type: "dissolve", duration_ms: 500 },
                    source_crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
                    item_key: "hero-a",
                    visual_role: "hero_talking",
                },
                {
                    position: 2000,
                    in: 0,
                    out: 2000,
                    speed: 1.5,
                    label: "Spine B",
                    video_url: "https://cdn.example/b.mp4",
                    asset_id: 99,
                    usage_id: 7,
                },
            ],
        },
        {
            id: "audio-0",
            type: "audio",
            items: [{
                position: 0,
                in: 0,
                out: 4000,
                label: "Voice",
                audio_url: "https://cdn.example/vo.mp3",
                voiceover_id: 3,
                volume: 1,
            }],
        },
        {
            id: "subtitle-0",
            type: "subtitle",
            caption_style: {
                position: "bottom",
                font_size: "md",
                font_family: "Inter",
                animation: "word",
                color: "#FFFFFF",
                background: "rgba(0,0,0,0.55)",
            },
            items: [{
                text: "Hello from the board",
                in: 200,
                out: 1800,
            }],
        },
        {
            id: "music-0",
            type: "music",
            items: [{
                position: 0,
                in: 0,
                out: 4000,
                label: "Bed",
                audio_url: "https://cdn.example/bed.mp3",
                volume: 0.4,
            }],
        },
    ],
};

function pickStable(serialized) {
    return serialized.map((track) => ({
        id: track.id,
        type: track.type,
        items: track.items.map((item) => {
            const copy = { ...item };
            return copy;
        }),
    }));
}

describe("timeline serialize/hydrate round-trip", () => {
    it("preserves media URLs, trims, speed, dissolve, pip, crop, and passthrough ids", () => {
        const hydrated = normalizeTracks(FIXTURE);
        const once = serializeTracks(hydrated);
        const twice = serializeTracks(normalizeTracks({ tracks: once }));

        assert.deepEqual(pickStable(twice), pickStable(once));

        const video0 = once.find((track) => track.id === "video-0");
        assert.equal(video0.items[0].video_url, "https://cdn.example/a.mp4");
        assert.equal(video0.items[0].in, 200);
        assert.equal(video0.items[0].out, 2200);
        assert.equal(video0.items[0].scene_id, 11);
        assert.equal(video0.items[0].visual_role, "hero_talking");
        assert.equal(video0.items[0].item_key, "hero-a");
        assert.equal(video0.items[0].transition_out.type, "dissolve");
        assert.equal(video0.items[0].transition_out.duration_ms, 500);
        assert.deepEqual(video0.items[0].source_crop, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
        assert.equal(video0.items[1].speed, 1.5);
        assert.equal(video0.items[1].asset_id, 99);

        const still = once.find((track) => track.id === "still-1");
        assert.equal(still.items[0].pip.enabled, true);
        assert.equal(still.items[0].pip.corner, "br");

        const zoom = once.find((track) => track.id === "zoom-0");
        assert.equal(zoom.items[0].transition_ms, 250);
        assert.equal(zoom.items[0].in, 400);
        assert.equal(zoom.items[0].out, 1600);

        const cues = subtitlesFromTracks(hydrated);
        assert.equal(cues[0].text, "Hello from the board");
        assert.equal(cues[0].in, 200);
        assert.equal(cues[0].out, 1800);

        assert.ok(wallClockTotalMs(hydrated) > 0);
    });

    it("keeps picture-stack order after a round-trip", () => {
        const ids = serializeTracks(normalizeTracks(FIXTURE)).map((track) => track.id);
        const stillAt = ids.indexOf("still-1");
        const spineAt = ids.indexOf("video-0");
        assert.ok(stillAt >= 0 && spineAt > stillAt);
        assert.ok(ids.indexOf("zoom-0") < stillAt);
        assert.ok(spineAt < ids.indexOf("audio-0"));
    });
});
