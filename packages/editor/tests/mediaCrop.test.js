/**
 * Crop math for timeline source windows.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    composeSourceCrop,
    defaultCropRect,
    fitRectToAspect,
    normalizeSourceCrop,
} from "../src/mediaCrop.js";

describe("normalizeSourceCrop", () => {
    it("clamps into 0–1 and rejects a tiny box", () => {
        const cropped = normalizeSourceCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
        assert.deepEqual(cropped, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
        assert.equal(normalizeSourceCrop({ x: 0.1, y: 0.1, w: 0.02, h: 0.5 }), null);
        assert.equal(normalizeSourceCrop(null), null);
    });

    it("treats a full-frame box as a no-op", () => {
        assert.equal(normalizeSourceCrop({ x: 0, y: 0, w: 1, h: 1 }), null);
        assert.equal(normalizeSourceCrop({ x: 0, y: 0, w: 0.999, h: 0.999 }), null);
    });

    it("shrinks a box that would overflow the source", () => {
        const cropped = normalizeSourceCrop({ x: 0.7, y: 0.6, w: 0.5, h: 0.5 });
        assert.ok(cropped);
        assert.ok(cropped.x + cropped.w <= 1.0001);
        assert.ok(cropped.y + cropped.h <= 1.0001);
        assert.ok(cropped.w >= 0.05);
    });
});

describe("composeSourceCrop", () => {
    it("maps zoom through the cropped window", () => {
        const composed = composeSourceCrop(
            { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
            { x: 0.2, y: 0.25, w: 0.5, h: 0.5 },
        );
        assert.deepEqual(composed, {
            x: 0.1 + 0.2 * 0.5,
            y: 0.2 + 0.25 * 0.4,
            w: 0.5 * 0.5,
            h: 0.5 * 0.4,
        });
    });

    it("returns the source crop when zoom is full frame", () => {
        const source = { x: 0.1, y: 0.1, w: 0.8, h: 0.7 };
        assert.deepEqual(composeSourceCrop(source, { x: 0, y: 0, w: 1, h: 1 }), source);
        assert.deepEqual(composeSourceCrop(source, null), source);
    });

    it("returns zoom alone when there is no source crop", () => {
        const zoom = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
        assert.deepEqual(composeSourceCrop(null, zoom), zoom);
        assert.equal(composeSourceCrop(null, { x: 0, y: 0, w: 1, h: 1 }), null);
    });
});

describe("fitRectToAspect", () => {
    it("keeps the box inside the source", () => {
        const fitted = fitRectToAspect(defaultCropRect(), 16 / 9);
        assert.ok(fitted.w / fitted.h - 16 / 9 < 0.02);
        assert.ok(fitted.x >= 0 && fitted.y >= 0);
        assert.ok(fitted.x + fitted.w <= 1.0001);
        assert.ok(fitted.y + fitted.h <= 1.0001);
    });
});
