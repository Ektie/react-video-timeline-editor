/**
 * Picture-stack order: overlays above the occupying spine.
 *
 * Run: npm run test:cs-gate
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    addTrack,
    normalizeTracks,
    occupyingSpineTrack,
    orderTracks,
    stackPictureTracks,
    trackRowFromId,
} from "../src/TimelineClipModel.js";

function video(id, items = []) {
    return { id, type: "video", items };
}

function still(id, items = []) {
    return { id, type: "still", items };
}

describe("timeline picture stack", () => {
    it("reads compiled track_row from type-N ids", () => {
        assert.equal(trackRowFromId("still-2"), 2);
        assert.equal(trackRowFromId("video-0"), 0);
        assert.equal(trackRowFromId("still_ab12"), null);
    });

    it("heals stills-below-spine into stills above video-0", () => {
        const healed = stackPictureTracks([
            video("video-1"),
            video("video-0"),
            still("still-2"),
            still("still-1"),
        ]);
        assert.deepEqual(healed.map((t) => t.id), ["still-2", "still-1", "video-1", "video-0"]);
        assert.equal(occupyingSpineTrack(healed).id, "video-0");
    });

    it("keeps interleaved higher track_row on top", () => {
        const stacked = stackPictureTracks([
            still("still-2"),
            video("video-1"),
            video("video-0"),
        ]);
        assert.deepEqual(stacked.map((t) => t.id), ["still-2", "video-1", "video-0"]);
    });

    it("puts user-added picture rows above compiled overlays", () => {
        const stacked = stackPictureTracks([
            video("video-1"),
            video("video-0"),
            still("still_user"),
        ]);
        assert.deepEqual(stacked.map((t) => t.id), ["still_user", "video-1", "video-0"]);
    });

    it("normalizeTracks regroups buried stills above the spine", () => {
        const tracks = normalizeTracks({
            tracks: [
                { id: "zoom-0", type: "zoom", items: [] },
                { id: "spotlight-0", type: "spotlight", items: [] },
                { id: "video-1", type: "video", items: [] },
                { id: "video-0", type: "video", items: [{ position: 0, in: 0, out: 1000 }] },
                { id: "still-2", type: "still", items: [{ position: 200, in: 0, out: 400 }] },
                { id: "audio-0", type: "audio", items: [] },
                { id: "subtitle-0", type: "subtitle", items: [] },
                { id: "music-0", type: "music", items: [] },
            ],
        });
        const ids = tracks.map((t) => t.id);
        const stillAt = ids.indexOf("still-2");
        const spineAt = ids.indexOf("video-0");
        assert.ok(stillAt >= 0 && spineAt > stillAt);
        assert.ok(ids.indexOf("zoom-0") < stillAt);
        assert.ok(spineAt < ids.indexOf("audio-0"));
    });

    it("orderTracks keeps picture lanes between effects and audio", () => {
        const ordered = orderTracks([
            { id: "audio-0", type: "audio", items: [] },
            video("video-0"),
            still("still-1"),
            { id: "zoom-0", type: "zoom", items: [] },
        ]);
        assert.deepEqual(ordered.map((t) => t.id), ["zoom-0", "still-1", "video-0", "audio-0"]);
    });

    it("addTrack still inserts above the occupying spine", () => {
        const next = addTrack([
            { id: "zoom-0", type: "zoom", items: [] },
            { id: "spotlight-0", type: "spotlight", items: [] },
            video("video-1"),
            video("video-0"),
            { id: "audio-0", type: "audio", items: [] },
            { id: "subtitle-0", type: "subtitle", items: [] },
            { id: "music-0", type: "music", items: [] },
        ], "still", { id: "still_new" });
        const ids = next.map((t) => t.id);
        assert.ok(ids.indexOf("still_new") < ids.indexOf("video-1"));
        assert.ok(ids.indexOf("still_new") < ids.indexOf("video-0"));
        assert.ok(ids.indexOf("zoom-0") < ids.indexOf("still_new"));
    });
});
