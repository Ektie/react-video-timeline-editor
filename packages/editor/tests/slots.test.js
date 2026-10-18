import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import {
    VideoTimelineEditor,
    createEmptyProject,
    ToolButton,
    ToolToggle,
    ToolSep,
    CtxItem,
} from "../dist/index.js";

describe("slots", () => {
    describe("emptyState slot", () => {
        it("renders emptyState when project has no clips", () => {
            const html = renderToString(React.createElement(VideoTimelineEditor, {
                project: createEmptyProject(),
                slots: { emptyState: React.createElement("div", { id: "empty-slot-msg" }, "Empty Message") },
            }));
            assert.ok(html.includes("id=\"empty-slot-msg\""));
            assert.ok(html.includes("cs-nle-empty-state"));
        });

        it("does not render emptyState when project has clips", () => {
            const project = createEmptyProject();
            project.tracks[0].items = [{
                _id: "clip-1",
                startMs: 0,
                durationMs: 3000,
                sourceStartMs: 0,
                sourceEndMs: 3000,
                speed: 1,
                label: "Test Clip",
            }];
            const html = renderToString(React.createElement(VideoTimelineEditor, {
                project,
                slots: { emptyState: React.createElement("div", { id: "empty-slot-msg" }, "Empty Message") },
            }));
            assert.ok(!html.includes("id=\"empty-slot-msg\""));
            assert.ok(!html.includes("cs-nle-empty-state"));
        });

        it("does not render emptyState wrapper when no slot provided", () => {
            const html = renderToString(React.createElement(VideoTimelineEditor, {
                project: createEmptyProject(),
            }));
            assert.ok(!html.includes("cs-nle-empty-state"));
        });
    });

    describe("toolbarExtra slot", () => {
        it("renders toolbarExtra when provided as ReactNode", () => {
            const html = renderToString(React.createElement(VideoTimelineEditor, {
                project: createEmptyProject(),
                slots: { toolbarExtra: React.createElement("button", { id: "test-tb-btn" }, "Custom Action") },
            }));
            assert.ok(html.includes("id=\"test-tb-btn\""));
        });

        it("renders toolbarExtra when provided as function with context", () => {
            let receivedContext = null;
            const html = renderToString(React.createElement(VideoTimelineEditor, {
                project: createEmptyProject(),
                slots: {
                    toolbarExtra: (ctx) => {
                        receivedContext = ctx;
                        return React.createElement("button", { id: "test-tb-fn" }, "Fn Action");
                    },
                },
            }));
            assert.ok(html.includes("id=\"test-tb-fn\""));
            assert.ok(receivedContext !== null);
            assert.ok(Array.isArray(receivedContext.selection));
            assert.ok(Array.isArray(receivedContext.tracks));
            assert.equal(typeof receivedContext.splitAtPlayhead, "function");
        });

        it("does not render toolbarExtra when omitted", () => {
            const html = renderToString(React.createElement(VideoTimelineEditor, {
                project: createEmptyProject(),
            }));
            assert.ok(!html.includes("test-tb-btn"));
            assert.ok(!html.includes("test-tb-fn"));
        });
    });

    describe("toolbar & context menu UI exports", () => {
        it("exports ToolButton, ToolToggle, ToolSep, and CtxItem", () => {
            assert.equal(typeof ToolButton, "function");
            assert.equal(typeof ToolToggle, "function");
            assert.equal(typeof ToolSep, "function");
            assert.equal(typeof CtxItem, "function");
        });
    });
});
