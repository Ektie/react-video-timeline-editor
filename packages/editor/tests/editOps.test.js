import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    insertClip,
    moveClips,
    normalizeTracks,
    serializeTracks,
    splitAt,
    trimClip,
} from "../src/TimelineClipModel.js";
import { createEmptyProject, mergeProjectPatch, normalizeProject } from "../src/project.js";

function videoTimeline() {
    return normalizeTracks({
        tracks: [{
            id: "video-0",
            type: "video",
            items: [{
                position: 0,
                in: 0,
                out: 4000,
                video_url: "https://cdn.example/a.mp4",
                label: "A",
            }],
        }],
    });
}

describe("edit operations", () => {
    it("splits a clip at the playhead", () => {
        const tracks = videoTimeline();
        const id = tracks.find((t) => t.id === "video-0").items[0]._id;
        const { tracks: next, didSplit } = splitAt(tracks, 1500, new Set([id]));
        assert.equal(didSplit, true);
        const items = next.find((t) => t.id === "video-0").items;
        assert.equal(items.length, 2);
        assert.equal(items[0].durationMs, 1500);
        assert.equal(items[1].startMs, 1500);
    });

    it("moves a clip later on the board", () => {
        const tracks = videoTimeline();
        const id = tracks.find((t) => t.id === "video-0").items[0]._id;
        const item = tracks.find((t) => t.id === "video-0").items[0];
        const { tracks: next } = moveClips(tracks, { [id]: item.startMs }, 800);
        assert.equal(next.find((t) => t.id === "video-0").items[0].startMs, 800);
    });

    it("trims the out point", () => {
        const tracks = videoTimeline();
        const id = tracks.find((t) => t.id === "video-0").items[0]._id;
        const { tracks: next } = trimClip(tracks, id, "end", -1000);
        assert.equal(next.find((t) => t.id === "video-0").items[0].durationMs, 3000);
    });

    it("inserts a still draft", () => {
        let tracks = videoTimeline();
        tracks = insertClip(tracks, "video-0", {
            label: "Still",
            durationMs: 1000,
            keyframe_url: "https://cdn.example/s.jpg",
        }, 4000);
        const items = tracks.find((t) => t.id === "video-0").items;
        assert.ok(items.some((item) => item.label === "Still"));
    });
});

describe("project helpers", () => {
    it("creates an empty project with required rows", () => {
        const project = createEmptyProject({ id: "demo", name: "Demo" });
        const types = project.tracks.map((t) => t.type);
        assert.ok(types.includes("video"));
        assert.ok(types.includes("audio"));
        assert.ok(types.includes("subtitle"));
        const again = normalizeProject(project);
        assert.deepEqual(serializeTracks(normalizeTracks(again)), again.tracks);
    });

    it("merges an onChange patch without dropping the name", () => {
        const project = createEmptyProject({ id: "demo", name: "Demo" });
        const merged = mergeProjectPatch(project, { tracks: project.tracks, total_duration_ms: 1234 });
        assert.equal(merged.name, "Demo");
        assert.equal(merged.total_duration_ms, 1234);
    });
});
