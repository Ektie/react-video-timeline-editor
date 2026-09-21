/**
 * Cuts canvas: backdrop / intro / outro helpers.
 *
 * Run: npm run test:cs-gate
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    CANVAS_DEFAULT_COLOR,
    canvasBackdropActive,
    canvasInsetsPicture,
    canvasIntroMs,
    canvasOutroMs,
    canvasPadMs,
    canvasPlateAt,
    contentWallMs,
    normalizeCanvas,
    normalizeTracks,
    wallClockTotalMs,
    wallClockWithCanvas,
} from "../src/TimelineClipModel.js";

describe("Cuts canvas", () => {
    it("defaults to today's black full-bleed stage", () => {
        const canvas = normalizeCanvas(null);
        assert.equal(canvas.backdrop.enabled, false);
        assert.equal(canvas.backdrop.mode, "color");
        assert.equal(canvas.backdrop.color, CANVAS_DEFAULT_COLOR);
        assert.equal(canvas.backdrop.image_url, null);
        assert.equal(canvas.intro.image_url, null);
        assert.equal(canvas.outro.image_url, null);
        assert.equal(canvasPadMs(canvas), 0);
    });

    it("keeps image mode so the still picker can open", () => {
        const canvas = normalizeCanvas({ backdrop: { mode: "image", enabled: true, color: "#112233" } });
        assert.equal(canvas.backdrop.mode, "image");
        assert.equal(canvas.backdrop.enabled, true);
        assert.equal(canvas.backdrop.color, "#112233");
        assert.equal(canvas.backdrop.image_url, null);
    });

    it("insets a color backdrop around the picture like abstract", () => {
        const canvas = normalizeCanvas({ backdrop: { enabled: true, mode: "color", color: "#1e1b4b" } });
        assert.equal(canvasBackdropActive(canvas), true);
        assert.equal(canvasInsetsPicture(canvas), true);
    });

    it("pads wall clock only when intro and outro stills are set", () => {
        const tracks = normalizeTracks({
            tracks: [{
                type: "video",
                items: [{ position: 0, in: 0, out: 4000, video_url: "/a.mp4" }],
            }],
        });
        const canvas = normalizeCanvas({
            intro: { image_url: "https://cdn.example/intro.jpg", duration_ms: 1500 },
            outro: { image_url: "https://cdn.example/outro.jpg", duration_ms: 2500 },
        });
        assert.equal(canvasIntroMs(canvas), 1500);
        assert.equal(canvasOutroMs(canvas), 2500);
        assert.equal(canvasPadMs(canvas), 4000);
        assert.equal(wallClockTotalMs(tracks), 4000);
        assert.equal(wallClockWithCanvas(tracks, canvas), 8000);
        assert.equal(contentWallMs(1700, canvas), 200);
        assert.equal(canvasPlateAt(200, canvas, 4000), "intro");
        assert.equal(canvasPlateAt(1500, canvas, 4000), null);
        assert.equal(canvasPlateAt(5600, canvas, 4000), "outro");
    });

    it("clamps plate holds to 0.5–6s", () => {
        assert.equal(normalizeCanvas({ intro: { duration_ms: 50 } }).intro.duration_ms, 500);
        assert.equal(normalizeCanvas({ outro: { duration_ms: 9000 } }).outro.duration_ms, 6000);
    });
});
