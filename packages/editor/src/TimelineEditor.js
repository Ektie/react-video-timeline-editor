import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Button, Icon, Tooltip } from "./ui";
import { placeFixedOverlay } from "./placeFixedOverlay";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "./ui";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui";
import { CtxItem, ToolButton, ToolSep, ToolToggle, TrackToolButton } from "./NleToolbar";
import TimelinePlayer from "./TimelinePlayer";
import TimelineClip from "./TimelineClip";
import SubtitlePanel from "./SubtitlePanel";
import CanvasPanel from "./CanvasPanel";
import AssetPicker from "./AssetPicker";
import useTimelineEngine from "./useTimelineEngine";
import { deliverySpec } from "./presets/aspectPresets";
import {
    TRACK_LABELS,
    TRACK_ORDER,
    addEffectClip,
    addSubtitleCue,
    addTrack,
    clipAt,
    clipEnd,
    clipIdsFromMs,
    closeGaps,
    detachAudio,
    detachableCounts,
    effectAt,
    findClip,
    findTrack,
    insertClip,
    insertCueBetween,
    isEffectTrack,
    isPictureTrack,
    liftDelete,
    mergeCues,
    moveClips,
    moveClipsToTrack,
    nudgeClips,
    pictureTracks,
    reattachAudio,
    removeTrack,
    resolveDrop,
    rippleDelete,
    setClipPip,
    setClipSplit,
    isSplitPair,
    splitClipAt,
    setClipSpeed,
    setEffectRect,
    setClipVolume,
    CLIP_SPEEDS,
    setCueTime,
    setSourceDuration,
    setSubtitleText,
    setSubtitleStyle,
    subtitleStyleFromTracks,
    setTrackFlag,
    trackUid,
    tracksOfType,
    snapPointsFor,
    splitAt,
    subtitleCues,
    setTransitionOut,
    setZoomTransition,
    trackLabel,
    trimClip,
    TRANSITION_DURATION_MS,
    zoomTransitionMs,
    PIP_CORNERS,
    PIP_DEFAULT_CORNER,
    PIP_DEFAULT_SIZE,
    PIP_MIN_SIZE,
    PIP_MAX_SIZE,
    uid,
    abuttedToWallMs,
    wallToAbuttedMs,
    clipsAbut,
    effectiveDissolveMs,
    normalizeCanvas,
    canvasIntroMs,
    canvasOutroMs,
    canvasPadMs,
    wallClockWithCanvas,
    wallToBoardMs,
    boardToWallMs,
} from "./TimelineClipModel";
import "./styles.css";

const GUTTER_WIDTH = 112;
const RATES = [0.5, 1, 1.5, 2];
const MIN_ZOOM = 0.008;
const MAX_ZOOM = 0.6;
const SNAP_PX = 8;
const EDGE_SCROLL_PX = 48;
const RULER_STEPS = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000];

/** Media types the toolbar "Add media" menu can place (not subtitle cues). */
const ADD_MEDIA_TYPES = ["video", "still", "audio", "music"];

const PIP_CORNER_TIPS = {
    tl: "Place PiP in the top left",
    tc: "Place PiP at the top center",
    tr: "Place PiP in the top right",
    ml: "Place PiP on the middle left",
    mc: "Place PiP in the center",
    mr: "Place PiP on the middle right",
    bl: "Place PiP in the bottom left",
    bc: "Place PiP at the bottom center",
    br: "Place PiP in the bottom right",
};

function formatClock(ms, withFraction = false) {
    const total = Math.max(0, Math.round(ms || 0));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (!withFraction) return base;
    return `${base}.${String(Math.floor((total % 1000) / 10)).padStart(2, "0")}`;
}

const STAGE_MIN = 180;
/** Leave the board a usable strip no matter how tall the preview is dragged. */
const stageMax = () => Math.max(STAGE_MIN, Math.round(window.innerHeight * 0.7));
const stageKey = (projectId) => `cs-nle-stage-h:${projectId || "default"}`;

function readStageHeight(projectId) {
    try {
        const stored = Number(window.localStorage.getItem(stageKey(projectId)));
        if (!(stored > 0)) return null;
        // Older sessions could persist a height past the board — clamp on read.
        return Math.min(stageMax(), Math.max(STAGE_MIN, Math.round(stored)));
    } catch (e) {
        return null;
    }
}

/** A filename someone can find again in their Downloads folder. */
function exportFilename(name, delivery) {
    const slug = String(name || "video")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "creative";
    return `${slug}-${String(delivery?.aspect_ratio || "").replace(":", "x") || "video"}.mp4`;
}

/** Where a row's content ends — the anchor for its trailing add button. */
function rowEnd(track) {
    return track.items.reduce((max, item) => Math.max(max, clipEnd(item)), 0);
}

function trackIcon(type) {
    if (type === "video") return "video";
    if (type === "still") return "photo";
    if (type === "zoom") return "crop";
    if (type === "spotlight") return "target";
    if (type === "subtitle") return "file-text";
    if (type === "music") return "music";
    return "microphone";
}

/**
 * The timeline: a working multi-track editor.
 *
 * Edits go through the pure reducers in TimelineClipModel via useTimelineEngine,
 * so every gesture is one undo step and the serialized result is exactly what
 * a host renderer can replay.
 */
export default function TimelineEditor({
    timeline,
    onChange,
    projectId = null,
    projectName = "video",
    assets = [],
    fonts,
    onUpload = null,
    aspectRatio = "9:16",
    resolution = "1080x1920",
    saveState = "idle",
    savedAt = null,
    onRetrySave,
    onRender = null,
    onAspectChange = null,
    slots = {},
}) {
    const canvasStateRef = useRef(normalizeCanvas(timeline?.canvas));
    const persistPatch = useCallback((patch) => {
        const canvasState = canvasStateRef.current;
        onChange?.({
            ...patch,
            canvas: canvasState,
            total_duration_ms: typeof patch.total_duration_ms === "number"
                ? patch.total_duration_ms + canvasPadMs(canvasState)
                : undefined,
        });
    }, [onChange]);

    const {
        tracks,
        tracksRef,
        selection,
        selectionRef,
        setSelection,
        totalMs: contentMs,
        boardMs: contentBoardMs,
        overlaps,
        canUndo,
        canRedo,
        commit,
        live,
        beginDrag,
        endDrag,
        undo,
        redo,
    } = useTimelineEngine(timeline, persistPatch);

    const [currentMs, setCurrentMs] = useState(0);
    const [seekNonce, setSeekNonce] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [rate, setRate] = useState(1);
    const [zoom, setZoom] = useState(0.05);
    const [guideMs, setGuideMs] = useState(null);
    const [dropHint, setDropHint] = useState(null);
    const [marquee, setMarquee] = useState(null);
    const [marqueeHits, setMarqueeHits] = useState(() => new Set());
    const [ctxMenu, setCtxMenu] = useState(null);
    const ctxMenuRef = useRef(null);
    const [ctxMenuStyle, setCtxMenuStyle] = useState({
        position: "fixed",
        opacity: 0,
        visibility: "hidden",
    });
    const [ripple, setRipple] = useState(true);
    const [magnet, setMagnet] = useState(true);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [soloTrack, setSoloTrack] = useState(null);
    const [showSafeAreas, setShowSafeAreas] = useState(false);
    const [editingCue, setEditingCue] = useState(null);
    const [subtitlePanel, setSubtitlePanel] = useState(null);
    const [canvasPanel, setCanvasPanel] = useState(false);
    const [canvas, setCanvas] = useState(() => normalizeCanvas(timeline?.canvas));
    canvasStateRef.current = canvas;
    const [picker, setPicker] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [stageH, setStageH] = useState(() => readStageHeight(projectId));

    const rootRef = useRef(null);
    const resizeRef = useRef(null);
    const scrollRef = useRef(null);
    const canvasRef = useRef(null);
    const lanesRef = useRef(null);
    const dragRef = useRef(null);
    const zoomAnchorRef = useRef(null);
    const currentMsRef = useRef(currentMs);
    currentMsRef.current = currentMs;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const rippleRef = useRef(ripple);
    rippleRef.current = ripple;
    const magnetRef = useRef(magnet);
    magnetRef.current = magnet;

    const introMs = canvasIntroMs(canvas);
    const outroMs = canvasOutroMs(canvas);
    const totalMs = contentMs + introMs + outroMs;
    const boardMs = contentBoardMs + introMs + outroMs;

    const pxPerMs = zoom;
    const canvasWidth = Math.max(720, boardMs * pxPerMs + 240);
    const msToX = useCallback((ms) => ms * zoomRef.current, []);
    const playheadBoardMs = useMemo(
        () => wallToBoardMs(tracks, currentMs, canvas),
        [tracks, currentMs, canvas]
    );
    const playheadAbutMs = useMemo(
        () => wallToAbuttedMs(tracks, Math.min(contentMs, Math.max(0, currentMs - introMs))),
        [tracks, currentMs, contentMs, introMs]
    );

    const clientXToMs = useCallback((clientX) => {
        const board = canvasRef.current;
        if (!board) return 0;
        const rect = board.getBoundingClientRect();
        return Math.max(0, Math.min(boardMs, (clientX - rect.left) / zoomRef.current));
    }, [boardMs]);

    /** Move the playhead from the UI (as opposed to playback advancing it). */
    const seekTo = useCallback((ms) => {
        const next = Math.max(0, Math.min(totalMs, ms));
        setCurrentMs(next);
        currentMsRef.current = next;
        setSeekNonce((n) => n + 1);
    }, [totalMs]);

    /** Scrub the board (including intro/outro pads) into wall-clock playhead time. */
    const seekBoardMs = useCallback((boardPos) => {
        seekTo(boardToWallMs(tracksRef.current, boardPos, canvasStateRef.current));
    }, [seekTo, tracksRef]);

    const persistCanvas = useCallback((next) => {
        const normalized = normalizeCanvas(next);
        setCanvas(normalized);
        canvasStateRef.current = normalized;
        onChange?.({
            canvas: normalized,
            total_duration_ms: wallClockWithCanvas(tracksRef.current, normalized),
        });
    }, [onChange, tracksRef]);

    const timelineCanvasKey = timeline?.id ?? "none";
    useEffect(() => {
        const next = normalizeCanvas(timeline?.canvas);
        setCanvas(next);
        canvasStateRef.current = next;
    }, [timelineCanvasKey]);

    // A shrinking timeline must not leave the playhead stranded past the end.
    useEffect(() => {
        if (currentMs > totalMs) seekTo(totalMs);
    }, [totalMs, currentMs, seekTo]);

    // ── Zoom ────────────────────────────────────────────────────────────────
    // Keep whatever the user was looking at pinned in place; the old build let
    // content slide out from under the cursor on every zoom step.
    const applyZoom = useCallback((nextZoom, anchorClientX) => {
        const scroll = scrollRef.current;
        const canvas = canvasRef.current;
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
        if (scroll && canvas) {
            const rect = canvas.getBoundingClientRect();
            const viewX = anchorClientX != null
                ? anchorClientX - scroll.getBoundingClientRect().left
                : Math.min(scroll.clientWidth / 2, msToX(playheadBoardMs) - scroll.scrollLeft);
            const anchorMs = anchorClientX != null
                ? (anchorClientX - rect.left) / zoomRef.current
                : playheadBoardMs;
            zoomAnchorRef.current = { anchorMs, viewX };
        }
        setZoom(clamped);
    }, [msToX]);

    useLayoutEffect(() => {
        const anchor = zoomAnchorRef.current;
        const scroll = scrollRef.current;
        zoomAnchorRef.current = null;
        if (!anchor || !scroll) return;
        scroll.scrollLeft = Math.max(0, anchor.anchorMs * zoom - anchor.viewX);
    }, [zoom]);

    const zoomToFit = useCallback(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;
        applyZoom((scroll.clientWidth - 48) / Math.max(1000, boardMs));
    }, [applyZoom, boardMs]);

    // React attaches wheel passively at the root, so preventDefault() inside an
    // onWheel prop is silently ignored and the browser page-zooms instead.
    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return undefined;
        const onWheel = (event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();
            const factor = Math.exp(-event.deltaY * 0.002);
            applyZoom(zoomRef.current * factor, event.clientX);
        };
        scroll.addEventListener("wheel", onWheel, { passive: false });
        return () => scroll.removeEventListener("wheel", onWheel);
    }, [applyZoom]);

    // Follow the playhead during playback instead of letting it walk off-screen.
    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll || dragRef.current) return;
        const x = msToX(playheadAbutMs);
        const left = scroll.scrollLeft;
        const right = left + scroll.clientWidth;
        if (x < left + 40) {
            scroll.scrollLeft = Math.max(0, x - 40);
        } else if (x > right - 120) {
            scroll.scrollLeft = x - scroll.clientWidth + 120;
        }
    }, [currentMs, msToX]);

    // ── Gestures ────────────────────────────────────────────────────────────
    // One persistent rAF per gesture: pointermove only records the cursor, the
    // frame loop does the work, and edge auto-scroll rides along for free.
    const startGesture = useCallback((event, config) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch (_) { /* capture is best-effort */ }

        setCtxMenu(null);
        const gesture = {
            ...config,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            moved: false,
            frame: null,
        };
        dragRef.current = gesture;
        if (config.recordHistory) beginDrag();

        const loop = () => {
            const active = dragRef.current;
            if (!active) return;

            const scroll = scrollRef.current;
            if (scroll && active.edgeScroll !== false) {
                const rect = scroll.getBoundingClientRect();
                if (active.lastX < rect.left + EDGE_SCROLL_PX) {
                    scroll.scrollLeft -= Math.min(24, (rect.left + EDGE_SCROLL_PX - active.lastX) / 2);
                } else if (active.lastX > rect.right - EDGE_SCROLL_PX) {
                    scroll.scrollLeft += Math.min(24, (active.lastX - rect.right + EDGE_SCROLL_PX) / 2);
                }
            }

            active.apply(active.lastX - active.startX, active.lastX, active.lastY);
            active.frame = requestAnimationFrame(loop);
        };
        gesture.frame = requestAnimationFrame(loop);
    }, [beginDrag]);

    const onGesturePointerMove = useCallback((event) => {
        const gesture = dragRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        if (
            Math.abs(gesture.lastX - gesture.startX) > 3
            || Math.abs(gesture.lastY - gesture.startY) > 3
        ) {
            gesture.moved = true;
        }
    }, []);

    const onGesturePointerUp = useCallback((event) => {
        const gesture = dragRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (gesture.frame) cancelAnimationFrame(gesture.frame);
        dragRef.current = null;
        setGuideMs(null);
        setDropHint(null);
        setMarquee(null);
        setMarqueeHits(new Set());
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch (_) { /* already released */ }
        if (gesture.recordHistory) endDrag(gesture.moved);
        gesture.onEnd?.(gesture.moved);
    }, [endDrag]);

    const gestureHandlers = {
        onPointerMove: onGesturePointerMove,
        onPointerUp: onGesturePointerUp,
        onPointerCancel: onGesturePointerUp,
    };

    const snapConfig = useCallback((excludeIds) => {
        if (!magnetRef.current) return { snapPoints: [], snapThresholdMs: 0 };
        return {
            snapPoints: snapPointsFor(tracksRef.current, excludeIds, [currentMsRef.current, totalMs]),
            snapThresholdMs: SNAP_PX / zoomRef.current,
        };
    }, [tracksRef, totalMs]);

    // Keep shortcuts alive after clicking clips/lanes (those nodes aren't focusable).
    const focusEditor = useCallback(() => {
        const root = rootRef.current;
        if (!root) return;
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
            return;
        }
        if (active === root) return;
        // Buttons/selects inside the editor can keep focus; everything else
        // (body, clips, lanes) should hand shortcuts back to the board.
        if (!root.contains(active) || !active || active === document.body
            || active.closest?.(".cs-nle-clip, .cs-nle-lanes, .cs-nle-board, .cs-nle-ruler")) {
            root.focus({ preventScroll: true });
        }
    }, []);

    // ── Scrub ───────────────────────────────────────────────────────────────
    const clientToBoard = useCallback((clientX, clientY) => {
        const canvas = canvasRef.current;
        const lanes = lanesRef.current;
        if (!canvas || !lanes) return { x: 0, y: 0 };
        const cRect = canvas.getBoundingClientRect();
        const lRect = lanes.getBoundingClientRect();
        return {
            x: clientX - cRect.left,
            y: clientY - lRect.top,
        };
    }, []);

    /**
     * Lane geometry, measured once per drag. Reading it every frame would be a
     * layout thrash, and nothing can move the lanes while a clip is in flight.
     */
    const measureLanes = useCallback(() => {
        const nodes = canvasRef.current?.querySelectorAll(".cs-nle-lane[data-track-id]") || [];
        const host = lanesRef.current?.getBoundingClientRect();
        return [...nodes].map((node) => {
            const rect = node.getBoundingClientRect();
            return {
                id: node.dataset.trackId,
                top: rect.top,
                bottom: rect.bottom,
                offsetTop: host ? rect.top - host.top : node.offsetTop,
                height: rect.height,
            };
        });
    }, []);

    const laneAt = useCallback((lanes, clientY) => {
        if (!lanes.length) return null;
        const hit = lanes.find((lane) => clientY >= lane.top && clientY <= lane.bottom);
        if (hit) return hit.id;
        // Past the top or bottom of the board, clamp rather than lose the drop.
        return clientY < lanes[0].top ? lanes[0].id : lanes[lanes.length - 1].id;
    }, []);

    const startScrub = useCallback((event) => {
        if (event.button !== 0) return;
        if (event.target.closest?.(".cs-nle-clip")) return;
        focusEditor();
        setPlaying(false);
        if (!event.shiftKey) setSelection(new Set());
        seekBoardMs(clientXToMs(event.clientX));
        startGesture(event, {
            recordHistory: false,
            apply: (_dx, clientX) => seekBoardMs(clientXToMs(clientX)),
        });
    }, [clientXToMs, focusEditor, seekBoardMs, setSelection, startGesture]);

    const startMarquee = useCallback((event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        // Cmd/Ctrl-drag must not paint the browser's native DOM selection over
        // the lanes — that looks like "the whole div is selected".
        try {
            window.getSelection()?.removeAllRanges();
        } catch (_) { /* ignore */ }
        focusEditor();
        setPlaying(false);
        const additive = event.shiftKey;
        const origin = clientToBoard(event.clientX, event.clientY);
        const lanes = measureLanes();
        let rect = {
            left: origin.x,
            top: origin.y,
            width: 0,
            height: 0,
        };
        setMarquee(rect);
        setMarqueeHits(new Set());

        const hitsInRect = (box) => {
            const ids = new Set();
            if (box.width < 2 && box.height < 2) return ids;
            const z = zoomRef.current;
            tracksRef.current.forEach((track) => {
                if (track.locked) return;
                const lane = lanes.find((l) => l.id === track.id);
                if (!lane) return;
                track.items.forEach((item) => {
                    const clip = {
                        left: (item.startMs + introMs) * z,
                        right: (item.startMs + introMs + item.durationMs) * z,
                        top: lane.offsetTop,
                        bottom: lane.offsetTop + lane.height,
                    };
                    if (
                        clip.left < box.left + box.width
                        && clip.right > box.left
                        && clip.top < box.top + box.height
                        && clip.bottom > box.top
                    ) {
                        ids.add(item._id);
                    }
                });
            });
            return ids;
        };

        startGesture(event, {
            recordHistory: false,
            edgeScroll: true,
            apply: (_dx, clientX, clientY) => {
                const cur = clientToBoard(clientX, clientY);
                rect = {
                    left: Math.min(origin.x, cur.x),
                    top: Math.min(origin.y, cur.y),
                    width: Math.abs(cur.x - origin.x),
                    height: Math.abs(cur.y - origin.y),
                };
                setMarquee(rect);
                setMarqueeHits(hitsInRect(rect));
            },
            onEnd: () => {
                const hit = hitsInRect(rect);
                if (additive) {
                    const next = new Set(selectionRef.current);
                    hit.forEach((id) => next.add(id));
                    setSelection(next);
                } else {
                    setSelection(hit);
                }
                setMarquee(null);
                setMarqueeHits(new Set());
            },
        });
    }, [
        clientToBoard, focusEditor, measureLanes, selectionRef, setSelection,
        startGesture, tracksRef,
    ]);

    const startLanePointer = useCallback((event) => {
        if (event.button !== 0) return;
        if (event.target.closest?.(".cs-nle-clip")) return;
        if (event.target.closest?.(".cs-nle-lane-add")) return;
        if (event.target.closest?.(".cs-nle-xfade")) return;
        if (event.metaKey || event.ctrlKey) {
            startMarquee(event);
            return;
        }
        startScrub(event);
    }, [startMarquee, startScrub]);

    // ── Move clips ──────────────────────────────────────────────────────────
    const startClipDrag = useCallback((event, item, track) => {
        if (track.locked) return;
        event.preventDefault();
        event.stopPropagation();
        focusEditor();
        setPlaying(false);

        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        let next;
        if (additive) {
            next = new Set(selectionRef.current);
            if (next.has(item._id)) next.delete(item._id);
            else next.add(item._id);
            setSelection(next);
            // Toggle-off: selection change only — don't start a drag.
            if (!next.has(item._id)) return;
        } else if (selectionRef.current.has(item._id)) {
            next = new Set(selectionRef.current);
            setSelection(next);
        } else {
            next = new Set([item._id]);
            setSelection(next);
        }

        // Reaching for a cue on the board is the same intent as reaching for it
        // in the preview: you want to read and edit the line.
        if (track.type === "subtitle") setSubtitlePanel({ focusId: item._id });

        const origins = {};
        tracksRef.current.forEach((t) => {
            if (t.locked) return;
            t.items.forEach((it) => {
                if (next.has(it._id)) origins[it._id] = it.startMs;
            });
        });

        // Only the clips sharing the grabbed clip's row change rows with it.
        // Anything else in the selection keeps its lane and just slides in time,
        // which is the only reading of a mixed-type selection that makes sense.
        const travelling = new Set(track.items.filter((it) => next.has(it._id)).map((it) => it._id));
        const lanes = measureLanes();
        const durations = new Map(track.items.map((it) => [it._id, it.durationMs]));
        let drop = null;

        startGesture(event, {
            recordHistory: true,
            apply: (dx, _clientX, clientY) => {
                const result = moveClips(
                    tracksRef.current,
                    origins,
                    dx / zoomRef.current,
                    snapConfig(new Set(Object.keys(origins)))
                );
                live(result.tracks);
                setGuideMs(result.guideMs);

                const spans = [...travelling].map((id) => ({
                    startMs: findClip(result.tracks, id)?.item.startMs ?? origins[id],
                    durationMs: durations.get(id) || 0,
                }));

                drop = resolveDrop(result.tracks, {
                    type: track.type,
                    spans,
                    targetTrackId: laneAt(lanes, clientY),
                    ignoreIds: travelling,
                });

                const lands = drop.isNew || drop.trackId !== track.id;
                const lane = lanes.find((l) => l.id === drop.trackId);
                const group = lanes.filter((l) => tracksRef.current
                    .some((t) => t.id === l.id && t.type === track.type));
                const anchor = lane || group[0];

                setDropHint(lands && anchor && spans.length
                    ? {
                        isNew: drop.isNew,
                        top: anchor.offsetTop,
                        height: anchor.height,
                        startMs: Math.min(...spans.map((s) => s.startMs)),
                        endMs: Math.max(...spans.map((s) => s.startMs + s.durationMs)),
                    }
                    : null);
            },
            onEnd: (moved) => {
                if (!moved || !drop) return;
                if (!drop.isNew && drop.trackId === track.id) return;
                live((current) => moveClipsToTrack(current, travelling, drop));
            },
        });
    }, [focusEditor, laneAt, live, measureLanes, selectionRef, setSelection, snapConfig, startGesture, tracksRef]);

    // ── Trim ────────────────────────────────────────────────────────────────
    const startTrim = useCallback((event, item, track, edge) => {
        if (track.locked) return;
        focusEditor();
        setPlaying(false);
        setSelection(new Set([item._id]));
        const base = tracksRef.current;

        startGesture(event, {
            recordHistory: true,
            apply: (dx) => {
                const result = trimClip(base, item._id, edge, dx / zoomRef.current, {
                    ripple: rippleRef.current,
                    ...snapConfig(new Set([item._id])),
                });
                live(result.tracks);
                setGuideMs(result.guideMs);
            },
        });
    }, [focusEditor, live, setSelection, snapConfig, startGesture, tracksRef]);

    // ── Commands ────────────────────────────────────────────────────────────
    const splitAtPlayhead = useCallback(() => {
        const at = wallToAbuttedMs(tracksRef.current, currentMsRef.current);
        // Always cut what's under the playhead. If a selection exists and some of
        // it sits under the needle, prefer that; otherwise still cut under the
        // needle so a selected clip elsewhere doesn't make Split a no-op.
        const under = new Set();
        tracksRef.current.forEach((track) => {
            if (track.locked) return;
            const item = clipAt(track.items, at);
            if (item) under.add(item._id);
        });
        if (!under.size) return;

        const selected = selectionRef.current;
        let targets = under;
        if (selected.size) {
            const selectedUnder = new Set([...under].filter((id) => selected.has(id)));
            if (selectedUnder.size) targets = selectedUnder;
        }

        const result = splitAt(tracksRef.current, at, targets);
        if (result.didSplit) commit(result.tracks);
    }, [commit, selectionRef, tracksRef]);

    const deleteSelected = useCallback((useRipple) => {
        const ids = selectionRef.current;
        if (!ids.size) return;
        const locked = new Set();
        tracksRef.current.forEach((track) => {
            if (track.locked) track.items.forEach((it) => locked.add(it._id));
        });
        const deletable = new Set([...ids].filter((id) => !locked.has(id)));
        if (!deletable.size) return;
        commit((current) => (useRipple ? rippleDelete(current, deletable) : liftDelete(current, deletable)));
        setSelection(new Set());
    }, [commit, selectionRef, setSelection, tracksRef]);

    const closeVideoGaps = useCallback(() => {
        commit((current) => overlaps.reduce((acc, id) => closeGaps(acc, id), current));
    }, [commit, overlaps]);

    const splitClipAudio = useCallback(() => {
        const ids = selectionRef.current;
        if (!ids.size) return;
        commit((current) => detachAudio(current, ids));
    }, [commit, selectionRef]);

    const restoreClipAudio = useCallback(() => {
        const ids = selectionRef.current;
        if (!ids.size) return;
        commit((current) => reattachAudio(current, ids));
    }, [commit, selectionRef]);

    const nudgeSelection = useCallback((deltaMs) => {
        if (!selectionRef.current.size) return;
        commit((current) => nudgeClips(current, selectionRef.current, deltaMs));
    }, [commit, selectionRef]);

    const selectFromMs = useCallback((fromMs, direction = "right", trackIds = null) => {
        focusEditor();
        setSelection(clipIdsFromMs(tracksRef.current, fromMs, { direction, trackIds }));
    }, [focusEditor, setSelection, tracksRef]);

    /** Track ids that own the current selection (or a single context-menu clip). */
    const selectionTrackIds = useCallback((clipId = null) => {
        const tracks = tracksRef.current;
        if (clipId) {
            const found = findClip(tracks, clipId);
            return found ? [found.track.id] : null;
        }
        const ids = selectionRef.current;
        if (!ids.size) return null;
        const trackIds = new Set();
        ids.forEach((id) => {
            const found = findClip(tracks, id);
            if (found) trackIds.add(found.track.id);
        });
        return trackIds.size ? [...trackIds] : null;
    }, [selectionRef, tracksRef]);

    const selectAllToTheRight = useCallback(() => {
        const clipId = ctxMenu?.clipId;
        const found = clipId ? findClip(tracksRef.current, clipId) : null;
        const fromMs = found
            ? found.item.startMs
            : wallToAbuttedMs(tracksRef.current, currentMsRef.current);
        // Prefer the row under the cursor / selection — never spill onto other lanes.
        const trackIds = selectionTrackIds(clipId)
            || (found ? [found.track.id] : null);
        selectFromMs(fromMs, "right", trackIds);
    }, [ctxMenu, selectFromMs, selectionTrackIds, tracksRef]);

    const toggleTrackFlag = useCallback((trackId, flag) => {
        commit((current) => {
            const track = findTrack(current, trackId);
            return setTrackFlag(current, trackId, flag, !(track?.[flag] === true));
        });
    }, [commit]);

    const toggleVisible = useCallback((trackId) => {
        commit((current) => {
            const track = findTrack(current, trackId);
            return setTrackFlag(current, trackId, "visible", track?.visible === false);
        });
    }, [commit]);

    const addRow = useCallback((type) => {
        const id = trackUid(type);
        commit((current) => addTrack(current, type, { id }));
        if (type === "still") {
            setPicker({ trackId: id, type: "still" });
        }
    }, [commit]);

    const renderAddTrackControl = () => (
        <div className="cs-nle-add-track">
            <Tooltip text="Add a video, stills, zoom, spotlight, voice, subtitle, or music row">
                <DropdownMenuTrigger>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-md"
                        aria-label="Add a timeline row"
                    >
                        <Icon name="plus" size={14} />
                        Track
                    </Button>
                    <DropdownMenu placement="top start" className="min-w-44">
                        {TRACK_ORDER.map((type) => (
                            <DropdownMenuItem
                                key={type}
                                textValue={TRACK_LABELS[type]}
                                onAction={() => addRow(type)}
                            >
                                <Icon name={trackIcon(type)} size={14} />
                                {TRACK_LABELS[type]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenu>
                </DropdownMenuTrigger>
            </Tooltip>
        </div>
    );

    const openPicker = useCallback((track) => {
        setPlaying(false);
        setUploadError(null);
        setPicker({ trackId: track.id, type: track.type });
    }, []);

    /**
     * Pick a row for new media of `type`.
     * - Topmost unlocked row already matches → use it.
     * - Otherwise create a new row (picture overlays always get a fresh top
     *   layer when the board top is a different type; voice/music reuse an
     *   existing unlocked row of that type when one exists).
     */
    const ensureMediaRow = useCallback((type) => {
        const current = tracksRef.current;
        const boardTop = current.find((track) => !track.locked) || null;
        if (boardTop && boardTop.type === type) return boardTop;

        const ofType = tracksOfType(current, type).filter((track) => !track.locked);
        if (!isPictureTrack(type) && ofType[0]) return ofType[0];

        const id = trackUid(type);
        const next = addTrack(current, type, { id });
        tracksRef.current = next;
        commit(next);
        return { id, type };
    }, [commit, tracksRef]);

    const openAddMedia = useCallback((type) => {
        const track = ensureMediaRow(type);
        openPicker(track);
    }, [ensureMediaRow, openPicker]);

    const placeDraft = useCallback((trackId, draft) => {
        commit((current) => insertClip(
            current,
            trackId,
            draft,
            wallToAbuttedMs(current, currentMsRef.current),
        ));
        setPicker(null);
    }, [commit]);

    const uploadToRow = useCallback(async (trackId, type, file) => {
        if (!onUpload) return;
        setUploading(true);
        setUploadError(null);
        try {
            const draft = await onUpload(file, type);
            if (draft) placeDraft(trackId, draft);
        } catch (error) {
            setUploadError(error?.message || "Upload failed.");
        } finally {
            setUploading(false);
        }
    }, [onUpload, placeDraft]);

    const dropRow = useCallback((trackId) => {
        commit((current) => removeTrack(current, trackId));
    }, [commit]);

    // Callers include onClick handlers, so anything that isn't a row id means
    // "the first subtitle row" rather than a click event pretending to be one.
    const addCue = useCallback((trackId) => {
        const target = typeof trackId === "string" ? trackId : null;
        commit((current) => addSubtitleCue(
            current,
            wallToAbuttedMs(current, currentMsRef.current),
            { trackId: target },
        ));
    }, [commit]);

    const addEffect = useCallback((type, trackId) => {
        const id = uid();
        const target = typeof trackId === "string" ? trackId : null;
        commit((current) => addEffectClip(
            current,
            type,
            wallToAbuttedMs(current, currentMsRef.current),
            { trackId: target, id },
        ));
        setSelection(new Set([id]));
    }, [commit, setSelection]);

    const applyTransition = useCallback((clipId, transition) => {
        commit((current) => setTransitionOut(current, clipId, transition));
    }, [commit]);

    const applyZoomTransition = useCallback((clipId, durationMs) => {
        commit((current) => setZoomTransition(current, clipId, durationMs));
    }, [commit]);

    const transitionTarget = useMemo(() => {
        if (!ctxMenu?.clipId) return null;
        const found = findClip(tracks, ctxMenu.clipId);
        if (!found || !isPictureTrack(found.track.type)) return null;
        const sorted = [...found.track.items].sort((a, b) => a.startMs - b.startMs);
        const index = sorted.findIndex((item) => item._id === found.item._id);
        const next = index >= 0 ? sorted[index + 1] : null;
        if (!next || !clipsAbut(found.item, next)) return null;
        return {
            item: found.item,
            next,
            dissolveMs: effectiveDissolveMs(found.item, next),
        };
    }, [ctxMenu, tracks]);

    const zoomTarget = useMemo(() => {
        if (!ctxMenu?.clipId) return null;
        const found = findClip(tracks, ctxMenu.clipId);
        if (!found || found.track.type !== "zoom") return null;
        return {
            item: found.item,
            transitionMs: zoomTransitionMs(found.item),
        };
    }, [ctxMenu, tracks]);

    const updateCue = useCallback((id, text) => {
        commit((current) => setSubtitleText(current, id, text));
    }, [commit]);

    const updateSubtitleStyle = useCallback((patch) => {
        commit((current) => setSubtitleStyle(current, patch));
    }, [commit]);

    const openSubtitles = useCallback((cueId = null) => {
        setSubtitlePanel({ focusId: cueId });
    }, []);

    const changeCueTime = useCallback((id, span) => {
        commit((current) => setCueTime(current, id, span));
    }, [commit]);

    const removeCue = useCallback((id) => {
        commit((current) => liftDelete(current, new Set([id])));
    }, [commit]);

    const splitCue = useCallback((id) => {
        const at = wallToAbuttedMs(tracksRef.current, currentMsRef.current);
        const result = splitAt(tracksRef.current, at, new Set([id]));
        if (result.didSplit) commit(result.tracks);
    }, [commit, tracksRef]);

    const insertCue = useCallback((beforeId, afterId) => {
        commit((current) => insertCueBetween(current, beforeId, afterId));
    }, [commit]);

    const joinCues = useCallback((beforeId, afterId) => {
        commit((current) => mergeCues(current, beforeId, afterId));
    }, [commit]);

    /** The panel's footer button: a new line after the last one, not at the playhead. */
    const appendCue = useCallback(() => {
        const existing = subtitleCues(tracksRef.current);
        const last = existing[existing.length - 1];
        if (!last) {
            addCue();
            return;
        }
        commit((current) => insertCueBetween(current, last.item._id, null));
    }, [addCue, commit, tracksRef]);

    const reportSourceDuration = useCallback((url, ms) => {
        const next = setSourceDuration(tracksRef.current, url, ms);
        if (next !== tracksRef.current) live(next);
    }, [live, tracksRef]);

    // ── Keyboard (scoped to the editor, not the whole window) ───────────────
    const onKeyDown = useCallback((event) => {
        const tag = (event.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return;

        const meta = event.metaKey || event.ctrlKey;
        if (meta && event.key.toLowerCase() === "z") {
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
            return;
        }
        if (meta && event.key.toLowerCase() === "a") {
            event.preventDefault();
            const all = new Set();
            tracksRef.current.forEach((t) => {
                if (t.locked) return;
                t.items.forEach((it) => all.add(it._id));
            });
            setSelection(all);
            return;
        }
        if (event.key === "]" || event.key === "[") {
            event.preventDefault();
            const direction = event.key === "]" ? "right" : "left";
            const trackIds = selectionTrackIds();
            let fromMs = wallToAbuttedMs(tracksRef.current, currentMsRef.current);
            if (selectionRef.current.size) {
                const starts = [...selectionRef.current]
                    .map((id) => findClip(tracksRef.current, id)?.item.startMs)
                    .filter((ms) => ms != null);
                if (starts.length) {
                    fromMs = direction === "right" ? Math.min(...starts) : Math.max(...starts);
                }
            }
            selectFromMs(fromMs, direction, trackIds);
            return;
        }

        const nudgeStep = event.shiftKey ? 1000 : Math.max(20, Math.round(1 / zoomRef.current));

        switch (event.key) {
            case " ":
                event.preventDefault();
                setPlaying((p) => !p);
                break;
            case "s":
            case "S":
                event.preventDefault();
                splitAtPlayhead();
                break;
            case "Delete":
            case "Backspace":
                event.preventDefault();
                deleteSelected(rippleRef.current);
                break;
            case "ArrowLeft":
                event.preventDefault();
                if (selectionRef.current.size) nudgeSelection(-nudgeStep);
                else seekTo(currentMsRef.current - nudgeStep);
                break;
            case "ArrowRight":
                event.preventDefault();
                if (selectionRef.current.size) nudgeSelection(nudgeStep);
                else seekTo(currentMsRef.current + nudgeStep);
                break;
            case "Home":
                event.preventDefault();
                seekTo(0);
                break;
            case "End":
                event.preventDefault();
                seekTo(totalMs);
                break;
            case "i":
            case "I": {
                event.preventDefault();
                const found = [...selectionRef.current]
                    .map((id) => findClip(tracksRef.current, id))
                    .filter(Boolean);
                if (found.length) seekBoardMs(Math.min(...found.map(({ item }) => item.startMs)));
                break;
            }
            case "o":
            case "O": {
                event.preventDefault();
                const found = [...selectionRef.current]
                    .map((id) => findClip(tracksRef.current, id))
                    .filter(Boolean);
                if (found.length) seekBoardMs(Math.max(...found.map(({ item }) => clipEnd(item))));
                break;
            }
            case "Escape":
                setSelection(new Set());
                setCtxMenu(null);
                break;
            case "+":
            case "=":
                event.preventDefault();
                applyZoom(zoomRef.current * 1.2);
                break;
            case "-":
            case "_":
                event.preventDefault();
                applyZoom(zoomRef.current / 1.2);
                break;
            default:
                break;
        }
    }, [
        applyZoom, deleteSelected, nudgeSelection, redo, seekTo, selectionRef,
        selectFromMs, selectionTrackIds, setSelection, splitAtPlayhead, totalMs,
        tracksRef, undo,
    ]);

    // ── Context menu dismissal ──────────────────────────────────────────────
    useEffect(() => {
        if (!ctxMenu) return undefined;
        const fromMenu = (event) => {
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            if (path.some((node) => node?.classList?.contains?.("cs-nle-ctx"))) return true;
            return !!event?.target?.closest?.(".cs-nle-ctx");
        };
        const close = (event) => {
            // pointerdown on a menu item would unmount the menu before click,
            // so the action never runs. Ignore presses (and inner scrolls) in the menu.
            if (fromMenu(event)) return;
            setCtxMenu(null);
        };
        const onKey = (event) => { if (event.key === "Escape") setCtxMenu(null); };
        // Capture so we win against other document listeners, but still skip the menu.
        window.addEventListener("pointerdown", close, true);
        window.addEventListener("keydown", onKey);
        window.addEventListener("scroll", close, true);
        return () => {
            window.removeEventListener("pointerdown", close, true);
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", close, true);
        };
    }, [ctxMenu]);

    const runCtxAction = useCallback((action) => (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
        setCtxMenu(null);
    }, []);

    const openContextMenu = useCallback((event, item) => {
        event.preventDefault();
        event.stopPropagation();
        focusEditor();
        if (item && !selectionRef.current.has(item._id)) setSelection(new Set([item._id]));
        setCtxMenuStyle({
            position: "fixed",
            left: event.clientX,
            top: event.clientY,
            opacity: 0,
            visibility: "hidden",
            zIndex: 10000,
        });
        setCtxMenu({
            x: event.clientX,
            y: event.clientY,
            clipId: item?._id || null,
        });
    }, [focusEditor, selectionRef, setSelection]);

    // Same portal + measure + flip/clamp as CustomDropdown: don't guess height.
    useLayoutEffect(() => {
        if (!ctxMenu) return undefined;
        const place = () => {
            const el = ctxMenuRef.current;
            if (!el) return;
            // Measure the natural box (same trick as CustomDropdown), then pick
            // the corner with the least overflow and clamp into the viewport.
            el.style.maxHeight = "none";
            el.style.overflowY = "visible";
            const width = el.offsetWidth;
            const height = el.offsetHeight;
            const placed = placeFixedOverlay({
                anchor: { top: ctxMenu.y, left: ctxMenu.x, width: 0, height: 0 },
                width,
                height,
            });
            setCtxMenuStyle({
                position: "fixed",
                top: placed.top,
                left: placed.left,
                maxHeight: placed.maxHeight,
                overflowY: height > placed.maxHeight ? "auto" : "visible",
                opacity: 1,
                visibility: "visible",
                zIndex: 10000,
            });
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    }, [ctxMenu]);

    // ── Derived view data ───────────────────────────────────────────────────
    const rulerMarks = useMemo(() => {
        const step = RULER_STEPS.find((candidate) => candidate * zoom >= 70) || RULER_STEPS[RULER_STEPS.length - 1];
        const marks = [];
        for (let t = 0; t <= boardMs + step; t += step) marks.push(t);
        return { marks, step };
    }, [boardMs, zoom]);

    // Solo is a monitoring choice, not an edit — it never touches saved state.
    const playbackTracks = useMemo(() => {
        if (!soloTrack) return tracks;
        return tracks.map((track) => (
            track.id === soloTrack || isPictureTrack(track.type) || track.type === "subtitle"
                || isEffectTrack(track.type)
                ? track
                : { ...track, muted: true }
        ));
    }, [tracks, soloTrack]);

    const trackLabels = useMemo(
        () => new Map(tracks.map((track) => [track.id, trackLabel(tracks, track)])),
        [tracks]
    );

    const transitionMarks = useMemo(() => {
        const marks = [];
        pictureTracks(tracks).filter((t) => t.visible !== false).forEach((track) => {
            const items = [...track.items].sort((a, b) => a.startMs - b.startMs);
            for (let i = 0; i < items.length - 1; i++) {
                if (!clipsAbut(items[i], items[i + 1])) continue;
                const dissolveMs = effectiveDissolveMs(items[i], items[i + 1]);
                marks.push({
                    key: `${track.id}-${items[i]._id}`,
                    trackId: track.id,
                    clipId: items[i]._id,
                    at: clipEnd(items[i]),
                    dissolveMs,
                });
            }
        });
        return marks;
    }, [tracks]);

    const zoomMarks = useMemo(() => {
        const marks = [];
        tracksOfType(tracks, "zoom").filter((t) => t.visible !== false).forEach((track) => {
            track.items.forEach((item) => {
                const transitionMs = zoomTransitionMs(item);
                marks.push({
                    key: `${item._id}-in`,
                    trackId: track.id,
                    clipId: item._id,
                    at: item.startMs,
                    transitionMs,
                    edge: "in",
                });
                marks.push({
                    key: `${item._id}-out`,
                    trackId: track.id,
                    clipId: item._id,
                    at: clipEnd(item),
                    transitionMs,
                    edge: "out",
                });
            });
        });
        return marks;
    }, [tracks]);

    const cues = useMemo(() => subtitleCues(tracks), [tracks]);
    const delivery = useMemo(
        () => deliverySpec({ aspectRatio, resolution }),
        [aspectRatio, resolution]
    );
    const selectionCount = selection.size;
    const audioSplit = useMemo(() => detachableCounts(tracks, selection), [tracks, selection]);
    // Single audio/music selection → Clip level (persisted). Distinct from
    // the transport preview volume slider below.
    const volumeClip = useMemo(() => {
        if (selection.size !== 1) return null;
        const id = [...selection][0];
        const hit = findClip(tracks, id);
        if (!hit) return null;
        if (hit.track.type !== "audio" && hit.track.type !== "music") return null;
        return hit;
    }, [selection, tracks]);
    const clipLevelPct = useMemo(() => {
        if (!volumeClip) return null;
        const fallback = volumeClip.track.type === "music" ? 0.15 : 1;
        const raw = volumeClip.item.volume != null ? Number(volumeClip.item.volume) : fallback;
        return Math.round(Math.max(0, Math.min(2, Number.isFinite(raw) ? raw : fallback)) * 100);
    }, [volumeClip]);
    const onClipLevelChange = useCallback((event) => {
        if (!volumeClip) return;
        const next = Number(event.target.value) / 100;
        commit((current) => setClipVolume(current, volumeClip.item._id, next));
    }, [commit, volumeClip]);

    // Single video selection → Picture-in-picture (upper row only).
    const pipTarget = useMemo(() => {
        if (selection.size !== 1) return null;
        const id = [...selection][0];
        const hit = findClip(tracks, id);
        if (!hit || !isPictureTrack(hit.track.type)) return null;
        const videoRows = pictureTracks(tracks);
        const base = videoRows.length ? videoRows[videoRows.length - 1] : null;
        const onBase = base && hit.track.id === base.id;
        return { ...hit, onBase, hasUpperRow: videoRows.length > 1 };
    }, [selection, tracks]);
    const pipEnabled = !!pipTarget?.item?.pip?.enabled;
    const pipCorner = pipTarget?.item?.pip?.corner || PIP_DEFAULT_CORNER;
    const pipSizePct = Math.round(
        Math.max(
            PIP_MIN_SIZE,
            Math.min(PIP_MAX_SIZE, Number(pipTarget?.item?.pip?.size) || PIP_DEFAULT_SIZE)
        ) * 100
    );
    const togglePip = useCallback(() => {
        if (!pipTarget || pipTarget.onBase) return;
        if (pipEnabled) {
            commit((current) => setClipPip(current, pipTarget.item._id, null));
            return;
        }
        commit((current) => setClipPip(current, pipTarget.item._id, {
            enabled: true,
            corner: PIP_DEFAULT_CORNER,
            size: PIP_DEFAULT_SIZE,
        }));
    }, [commit, pipTarget, pipEnabled]);
    const setPipCorner = useCallback((corner) => {
        if (!pipTarget || pipTarget.onBase) return;
        commit((current) => setClipPip(current, pipTarget.item._id, {
            enabled: true,
            corner,
            size: (Number(pipTarget.item.pip?.size) || PIP_DEFAULT_SIZE),
        }));
    }, [commit, pipTarget]);
    const onPipSizeChange = useCallback((event) => {
        if (!pipTarget || pipTarget.onBase) return;
        const size = Number(event.target.value) / 100;
        commit((current) => setClipPip(current, pipTarget.item._id, {
            enabled: true,
            corner: pipTarget.item.pip?.corner || PIP_DEFAULT_CORNER,
            size,
        }));
    }, [commit, pipTarget]);
    const splitTarget = pipTarget;
    const splitEnabled = !!splitTarget && isSplitPair(splitTarget.item);
    const splitSwap = !!splitTarget?.item?.split?.swap;
    const toggleSplit = useCallback(() => {
        if (!splitTarget || splitTarget.onBase) return;
        if (splitEnabled) {
            commit((current) => setClipSplit(current, splitTarget.item._id, null));
            return;
        }
        commit((current) => setClipSplit(current, splitTarget.item._id, {
            enabled: true,
            axis: "horizontal",
            swap: false,
            self: splitTarget.item.split?.self || { cx: 0.5, cy: 0.5 },
            peer: splitTarget.item.split?.peer || { cx: 0.5, cy: 0.5 },
        }));
    }, [commit, splitTarget, splitEnabled]);
    const toggleSplitSwap = useCallback(() => {
        if (!splitTarget || splitTarget.onBase || !splitEnabled) return;
        commit((current) => setClipSplit(current, splitTarget.item._id, {
            enabled: true,
            axis: "horizontal",
            swap: !splitTarget.item.split?.swap,
            self: splitTarget.item.split?.self || { cx: 0.5, cy: 0.5 },
            peer: splitTarget.item.split?.peer || { cx: 0.5, cy: 0.5 },
        }));
    }, [commit, splitTarget, splitEnabled]);
    const onSplitPanBegin = useCallback(() => {
        beginDrag();
    }, [beginDrag]);
    const onSplitPanLive = useCallback((role, focus) => {
        live((current) => {
            const item = splitClipAt(current, playheadAbutMs);
            if (!item) return current;
            const currentSplit = item.split || { enabled: true };
            return setClipSplit(current, item._id, {
                enabled: true,
                axis: "horizontal",
                swap: !!currentSplit.swap,
                self: role === "self" ? focus : (currentSplit.self || { cx: 0.5, cy: 0.5 }),
                peer: role === "peer" ? focus : (currentSplit.peer || { cx: 0.5, cy: 0.5 }),
            });
        });
    }, [live, playheadAbutMs]);
    const onSplitPanCommit = useCallback((moved) => {
        endDrag(moved);
    }, [endDrag]);

    const pictureTarget = useMemo(() => {
        if (selection.size === 1) {
            const hit = findClip(tracks, [...selection][0]);
            if (hit && isPictureTrack(hit.track.type)) return hit;
        }
        const video = tracks.find((track) => track.type === "video");
        if (!video) return null;
        const item = clipAt(video.items, playheadAbutMs);
        if (!item) return null;
        return { track: video, item };
    }, [selection, tracks, playheadAbutMs]);
    const clipSpeedValue = pictureTarget ? (Number(pictureTarget.item.speed) || 1) : 1;

    const onSpeedChange = useCallback((key) => {
        if (!pictureTarget || !key) return;
        commit((current) => setClipSpeed(current, pictureTarget.item._id, Number(key)));
    }, [commit, pictureTarget]);

    const regionEdits = useMemo(() => {
        if (playing) return [];
        if (selection.size === 1) {
            const hit = findClip(tracks, [...selection][0]);
            if (hit && isEffectTrack(hit.track.type)) {
                return [{
                    id: hit.item._id,
                    kind: hit.track.type,
                    rect: hit.item.rect,
                }];
            }
            return [];
        }
        // Nothing selected: the box under the playhead is still a handle, but
        // not during playback — then the player shows the compiled look.
        if (selection.size > 0 || playing) return [];
        const edits = [];
        ["zoom", "spotlight"].forEach((type) => {
            const hit = effectAt(tracks, type, playheadAbutMs);
            if (hit?.item) {
                edits.push({
                    id: hit.item._id,
                    kind: type,
                    rect: hit.item.rect,
                });
            }
        });
        return edits;
    }, [selection, tracks, playheadAbutMs, playing]);

    const onRegionLive = useCallback((id, rect) => {
        live((current) => setEffectRect(current, id, rect));
    }, [live]);

    const onRegionBegin = useCallback(() => {
        beginDrag();
    }, [beginDrag]);

    const onRegionCommit = useCallback((moved) => {
        endDrag(moved);
    }, [endDrag]);

    // ── Preview / board split ───────────────────────────────────────────────
    const applyStageHeight = useCallback((px) => {
        const next = Math.round(Math.min(stageMax(), Math.max(STAGE_MIN, px)));
        setStageH(next);
        try {
            window.localStorage.setItem(stageKey(projectId), String(next));
        } catch (e) { /* private browsing; the drag still works for this session */ }
    }, [projectId]);

    const resetStageHeight = useCallback(() => {
        setStageH(null);
        try {
            window.localStorage.removeItem(stageKey(projectId));
        } catch (e) { /* nothing to clean up */ }
    }, [projectId]);

    const startStageResize = useCallback((event) => {
        const stage = rootRef.current?.querySelector(".cs-nle-stage");
        if (!stage) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        resizeRef.current = { y: event.clientY, h: stage.getBoundingClientRect().height };
    }, []);

    const moveStageResize = useCallback((event) => {
        const drag = resizeRef.current;
        if (!drag) return;
        applyStageHeight(drag.h + (event.clientY - drag.y));
    }, [applyStageHeight]);

    const endStageResize = useCallback((event) => {
        if (!resizeRef.current) return;
        resizeRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const nudgeStageResize = useCallback((event) => {
        const step = event.shiftKey ? 48 : 12;
        const stage = rootRef.current?.querySelector(".cs-nle-stage");
        if (!stage) return;
        const current = stage.getBoundingClientRect().height;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            applyStageHeight(current + step);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            applyStageHeight(current - step);
        } else if (event.key === "Home") {
            event.preventDefault();
            event.stopPropagation();
            applyStageHeight(STAGE_MIN);
        } else if (event.key === "End") {
            event.preventDefault();
            event.stopPropagation();
            applyStageHeight(stageMax());
        } else if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            resetStageHeight();
        }
        // Leave other keys (S, Space, …) alone so the editor shortcuts still fire.
    }, [applyStageHeight, resetStageHeight]);

    const savedTime = savedAt
        ? new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : null;
    const saveLabel = {
        saving: "Saving…",
        saved: savedTime ? `Saved ${savedTime}` : "Saved",
        error: "Couldn’t save",
    }[saveState] || "";

    return (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
            className="cs-nle"
            ref={rootRef}
            tabIndex={0}
            role="application"
            aria-label="Timeline editor. Space plays, S splits, arrow keys nudge."
            onKeyDown={onKeyDown}
            style={stageH ? { "--stage-h": `${stageH}px` } : undefined}
        >
            <div className={`cs-nle-top ${subtitlePanel || canvasPanel ? "has-rail" : ""}`}>
                <div className="cs-nle-viewer">
                    {subtitlePanel && (
                        <SubtitlePanel
                            cues={cues}
                            currentMs={Math.max(0, currentMs - introMs)}
                            focusId={subtitlePanel.focusId}
                            style={subtitleStyleFromTracks(tracks)}
                            fonts={fonts}
                            onSeek={(ms) => seekTo(introMs + ms)}
                            onChangeText={updateCue}
                            onChangeTime={changeCueTime}
                            onChangeStyle={updateSubtitleStyle}
                            onDelete={removeCue}
                            onSplit={splitCue}
                            onAdd={appendCue}
                            onInsertBetween={insertCue}
                            onMerge={joinCues}
                            onClose={() => setSubtitlePanel(null)}
                        />
                    )}
                    {canvasPanel && (
                        <CanvasPanel
                            canvas={canvas}
                            assets={assets}
                            uploading={uploading}
                            uploadError={uploadError}
                            onChange={persistCanvas}
                            onUpload={onUpload}
                            onClose={() => setCanvasPanel(false)}
                        />
                    )}

                    <TimelinePlayer
                        tracks={playbackTracks}
                        totalMs={totalMs}
                        currentMs={currentMs}
                        canvas={canvas}
                        seekNonce={seekNonce}
                        playing={playing}
                        rate={rate}
                        muted={muted}
                        volume={volume}
                        aspectRatio={delivery.aspect_ratio}
                        showSafeAreas={showSafeAreas}
                        onTimeUpdate={setCurrentMs}
                        onPlayingChange={setPlaying}
                        onSourceDuration={reportSourceDuration}
                        onCueClick={(cue) => openSubtitles(cue._id)}
                        regionEdits={regionEdits}
                        onRegionBegin={onRegionBegin}
                        onRegionLive={onRegionLive}
                        onRegionCommit={onRegionCommit}
                        onSplitPanBegin={onSplitPanBegin}
                        onSplitPanLive={onSplitPanLive}
                        onSplitPanCommit={onSplitPanCommit}
                    />
                </div>

                <div
                    className="cs-nle-resize"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize the preview. Arrow keys adjust, Enter resets."
                    tabIndex={0}
                    onPointerDown={startStageResize}
                    onPointerMove={moveStageResize}
                    onPointerUp={endStageResize}
                    onPointerCancel={endStageResize}
                    onDoubleClick={resetStageHeight}
                    onKeyDown={nudgeStageResize}
                >
                    <span className="cs-nle-resize-grip" aria-hidden />
                </div>

                <div className="cs-nle-toolbars">
                    <div className="cs-nle-toolbar is-edit">
                        <div className="cs-nle-toolbar-group">
                            <ToolButton tooltip="Undo the last edit" disabled={!canUndo} onClick={undo}>
                                <Icon name="undo" size={16} />
                            </ToolButton>
                            <ToolButton tooltip="Redo the last undone edit" disabled={!canRedo} onClick={redo}>
                                <Icon name="redo" size={16} />
                            </ToolButton>
                            <ToolSep />
                            <div className="cs-nle-add-media">
                                <Tooltip text="Add media to the timeline">
                                    <DropdownMenuTrigger>
                                        <Button type="button" variant="outline" size="sm" className="h-7 rounded-md">
                                            <Icon name="plus" size={14} />
                                            Media
                                        </Button>
                                        <DropdownMenu placement="bottom start" className="min-w-44">
                                            {ADD_MEDIA_TYPES.map((type) => (
                                                <DropdownMenuItem
                                                    key={type}
                                                    textValue={TRACK_LABELS[type]}
                                                    onAction={() => openAddMedia(type)}
                                                >
                                                    <Icon name={trackIcon(type)} size={14} />
                                                    {TRACK_LABELS[type]}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenu>
                                    </DropdownMenuTrigger>
                                </Tooltip>
                            </div>
                            <ToolButton tooltip="Split the selected clip at the playhead" onClick={splitAtPlayhead}>
                                <Icon name="scissors" size={16} />
                            </ToolButton>
                            {(audioSplit.detachable > 0 || audioSplit.detached > 0) && (
                                <ToolButton
                                    tooltip={audioSplit.detachable
                                        ? "Lift the selected clip's own audio onto an audio row"
                                        : "Put this clip's audio back into the clip"}
                                    onClick={audioSplit.detachable ? splitClipAudio : restoreClipAudio}
                                >
                                    <Icon name="audio-lines" size={16} />
                                </ToolButton>
                            )}
                            {selectionCount > 0 && (
                                <ToolButton
                                    tooltip={ripple ? "Delete the selection and pull later clips along" : "Delete the selection and leave a gap"}
                                    onClick={() => deleteSelected(ripple)}
                                >
                                    <Icon name="trash" size={16} />
                                </ToolButton>
                            )}
                            <ToolToggle
                                tooltip="Ripple: trims and deletes pull later clips along"
                                label="Ripple"
                                isSelected={ripple}
                                onChange={setRipple}
                            />
                            <ToolToggle
                                tooltip="Snap clips to edges and the playhead"
                                isSelected={magnet}
                                onChange={setMagnet}
                            >
                                <Icon name="magnet" size={16} />
                            </ToolToggle>
                            {selectionCount > 1 && (
                                <span className="cs-nle-selection-chip">
                                    {selectionCount} selected
                                </span>
                            )}
                            {volumeClip && clipLevelPct != null && (
                                <label className="cs-nle-clip-level">
                                    <span>Level</span>
                                    <input
                                        type="range"
                                        className="cs-nle-volume"
                                        min={0}
                                        max={200}
                                        step={1}
                                        value={clipLevelPct}
                                        onChange={onClipLevelChange}
                                        aria-label="Per-clip gain in the cut"
                                        aria-valuetext={`${clipLevelPct}%`}
                                    />
                                    <span className="cs-nle-clip-level-pct">{clipLevelPct}%</span>
                                </label>
                            )}
                            {pictureTarget && (
                                <div className="cs-nle-pip" role="group" aria-label="Clip picture">
                                    <label className="cs-nle-clip-level">
                                        <span>Speed</span>
                                        <Select
                                            selectedKey={String(clipSpeedValue)}
                                            onSelectionChange={onSpeedChange}
                                            aria-label="Playback speed of this clip"
                                            className="w-auto"
                                        >
                                            <SelectTrigger className="h-7 min-w-[58px] rounded-md px-2 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CLIP_SPEEDS.map((s) => (
                                                    <SelectItem key={s} id={String(s)}>{s}x</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </label>
                                </div>
                            )}
                            {pipTarget && !pipTarget.onBase && (
                                <div className="cs-nle-pip">
                                    <ToolToggle
                                        tooltip="Float this clip as a picture-in-picture inset over the base video"
                                        label="PiP"
                                        isSelected={pipEnabled}
                                        onChange={() => togglePip()}
                                    />
                                    <ToolToggle
                                        tooltip="Stack this clip above the base video and crop each half"
                                        label="Split"
                                        isSelected={splitEnabled}
                                        onChange={() => toggleSplit()}
                                    />
                                    {splitEnabled && (
                                        <>
                                            <ToolToggle
                                                tooltip="Swap which clip sits on top"
                                                label="Swap"
                                                isSelected={splitSwap}
                                                onChange={() => toggleSplitSwap()}
                                            />
                                            <span className="cs-nle-pip-hint">Drag each half to reframe</span>
                                        </>
                                    )}
                                    {pipEnabled && (
                                        <>
                                            <span className="cs-nle-pip-corners" role="group" aria-label="PiP position">
                                                {PIP_CORNERS.map((corner) => (
                                                    <Tooltip key={corner} text={PIP_CORNER_TIPS[corner]}>
                                                        <button
                                                            type="button"
                                                            data-corner={corner}
                                                            className={`cs-nle-pip-corner ${pipCorner === corner ? "is-active" : ""}`}
                                                            aria-label={PIP_CORNER_TIPS[corner]}
                                                            aria-pressed={pipCorner === corner}
                                                            onClick={() => setPipCorner(corner)}
                                                        />
                                                    </Tooltip>
                                                ))}
                                            </span>
                                            <label className="cs-nle-clip-level">
                                                <span>Size</span>
                                                <input
                                                    type="range"
                                                    className="cs-nle-pip-size"
                                                    min={Math.round(PIP_MIN_SIZE * 100)}
                                                    max={Math.round(PIP_MAX_SIZE * 100)}
                                                    step={1}
                                                    value={pipSizePct}
                                                    onChange={onPipSizeChange}
                                                    aria-label="PiP inset width"
                                                    aria-valuetext={`${pipSizePct}%`}
                                                />
                                                <span className="cs-nle-clip-level-pct">{pipSizePct}%</span>
                                            </label>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="cs-nle-toolbar-group cs-nle-transport">
                            <Tooltip text={playing ? "Pause the cut" : "Play the cut"}>
                                <Button
                                    type="button"
                                    variant="human"
                                    size="icon-sm"
                                    className="cs-nle-play rounded-md"
                                    onClick={() => setPlaying((p) => !p)}
                                    aria-label={playing ? "Pause the cut" : "Play the cut"}
                                >
                                    <Icon name={playing ? "player-pause" : "player-play"} size={16} />
                                </Button>
                            </Tooltip>
                            <label className="cs-nle-visually-hidden" htmlFor="cs-nle-rate">Playback speed</label>
                            <Select
                                id="cs-nle-rate"
                                selectedKey={String(rate)}
                                onSelectionChange={(key) => {
                                    if (key) setRate(Number(key));
                                }}
                                aria-label="Playback speed"
                                className="cs-nle-rate"
                            >
                                <SelectTrigger className="cs-nle-rate-trigger h-7 min-w-[62px] px-2 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {RATES.map((r) => (
                                        <SelectItem key={r} id={String(r)}>{r}x</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span className="cs-nle-clock" aria-live="off">
                                {formatClock(currentMs, true)} <span>/ {formatClock(totalMs, true)}</span>
                            </span>
                            <ToolButton
                                tooltip={muted ? "Turn preview sound on" : "Mute preview sound"}
                                onClick={() => setMuted((m) => !m)}
                            >
                                <Icon name={muted ? "volume-off" : "volume"} size={16} />
                            </ToolButton>
                            {!muted && (
                                <>
                                    <label className="cs-nle-visually-hidden" htmlFor="cs-nle-volume">Preview volume</label>
                                    <input
                                        id="cs-nle-volume"
                                        type="range"
                                        className="cs-nle-volume"
                                        min={0}
                                        max={100}
                                        value={Math.round(volume * 100)}
                                        onChange={(e) => setVolume(Number(e.target.value) / 100)}
                                        title="Preview volume (listening only — not saved on the clip)"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    <div className="cs-nle-toolbar is-view">
                        <div className="cs-nle-toolbar-group">
                            {slots.headerStart}
                            {onAspectChange && (
                                <span className="cs-nle-delivery">
                                    <span>{delivery.aspect_ratio}</span>
                                    <span className="text-muted-foreground">{delivery.resolution}</span>
                                </span>
                            )}
                            {saveLabel && (
                                <span className={`cs-nle-save is-${saveState}`} role="status">
                                    {saveState === "error" ? (
                                        <>
                                            <Icon name="alert-triangle" size={14} />
                                            {saveLabel}
                                            <ToolButton tooltip="Retry saving this timeline" label="Retry" onClick={onRetrySave} />
                                        </>
                                    ) : (
                                        <>
                                            <Icon name={saveState === "saving" ? "loader" : "check"} size={14} />
                                            {saveLabel}
                                        </>
                                    )}
                                </span>
                            )}
                            <ToolToggle
                                tooltip="Read and edit the subtitles beside the preview"
                                isSelected={!!subtitlePanel}
                                onChange={(open) => {
                                    setSubtitlePanel(open ? { focusId: null } : null);
                                    if (open) setCanvasPanel(false);
                                }}
                            >
                                <Icon name="file-text" size={16} />
                            </ToolToggle>
                            <ToolToggle
                                tooltip="Choose a backdrop, intro, and outro"
                                isSelected={canvasPanel}
                                onChange={(open) => {
                                    setCanvasPanel(!!open);
                                    if (open) setSubtitlePanel(null);
                                }}
                            >
                                <Icon name="photo" size={16} />
                            </ToolToggle>
                            <ToolToggle
                                tooltip="Show platform safe areas on the preview"
                                isSelected={showSafeAreas}
                                onChange={setShowSafeAreas}
                            >
                                <Icon name="crop" size={16} />
                            </ToolToggle>
                        </div>

                        <div className="cs-nle-toolbar-group cs-nle-toolbar-end">
                            <ToolButton tooltip="Zoom the timeline out" onClick={() => applyZoom(zoom / 1.2)}>
                                <Icon name="minus" size={16} />
                            </ToolButton>
                            <label className="cs-nle-visually-hidden" htmlFor="cs-nle-zoom">Zoom</label>
                            <input
                                id="cs-nle-zoom"
                                type="range"
                                className="cs-nle-zoom"
                                min={Math.round(MIN_ZOOM * 1000)}
                                max={Math.round(MAX_ZOOM * 1000)}
                                value={Math.round(zoom * 1000)}
                                onChange={(e) => applyZoom(Number(e.target.value) / 1000)}
                                aria-label="Timeline zoom"
                            />
                            <ToolButton tooltip="Zoom the timeline in" onClick={() => applyZoom(zoom * 1.2)}>
                                <Icon name="plus" size={16} />
                            </ToolButton>
                            <ToolButton tooltip="Fit the whole timeline in view" label="Fit" onClick={zoomToFit} />
                            {slots.headerEnd || (onRender && (
                                <>
                                    <ToolSep />
                                    <ToolButton tooltip="Export this timeline" label="Export" onClick={onRender} />
                                </>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {overlaps.length > 0 && (
                <div className="cs-nle-banner" role="status">
                    <Icon name="alert-triangle" size={16} />
                    <span>
                        Two clips share the same moment on one video row, so the render has to trim
                        one of them. Move a clip to a row above to keep both, or close the gaps.
                    </span>
                    <Button type="button" variant="human" size="sm" onClick={closeVideoGaps}>Close gaps</Button>
                </div>
            )}

            <div className="cs-nle-board">
                <div className="cs-nle-board-body">
                <div className="cs-nle-gutter" style={{ width: GUTTER_WIDTH }}>
                    <div className="cs-nle-gutter-ruler" />
                    {tracks.map((track) => {
                        const name = trackLabels.get(track.id);
                        const removable = !track.items.length
                            && (track.type === "still"
                                || tracks.filter((t) => t.type === track.type).length > 1);
                        const toolsActive = track.visible === false || track.muted || track.locked
                            || soloTrack === track.id;
                        return (
                            <div
                                key={track.id}
                                className={`cs-nle-gutter-row cs-nle-row--${track.type}${toolsActive ? " is-armed" : ""}`}
                            >
                                <span className="cs-nle-gutter-name" title={name}>
                                    <Icon name={trackIcon(track.type)} size={13} />
                                    <span>{name}</span>
                                </span>
                                <span className="cs-nle-gutter-tools">
                                    {removable && (
                                        <TrackToolButton
                                            tooltip="Remove this empty row"
                                            danger
                                            onClick={() => dropRow(track.id)}
                                        >
                                            <Icon name="x" size={12} />
                                        </TrackToolButton>
                                    )}
                                    <TrackToolButton
                                        tooltip={track.visible === false ? "Show this track" : "Hide this track"}
                                        isOn={track.visible === false}
                                        onClick={() => toggleVisible(track.id)}
                                    >
                                        <Icon name={track.visible === false ? "eye-off" : "eye"} size={13} />
                                    </TrackToolButton>
                                    {(track.type === "audio" || track.type === "music") && (
                                        <>
                                            <TrackToolButton
                                                tooltip={track.muted ? "Unmute this track" : "Mute this track"}
                                                isOn={!!track.muted}
                                                onClick={() => toggleTrackFlag(track.id, "muted")}
                                            >
                                                <Icon name={track.muted ? "volume-off" : "volume"} size={13} />
                                            </TrackToolButton>
                                            <TrackToolButton
                                                tooltip="Solo this track while you listen"
                                                isOn={soloTrack === track.id}
                                                onClick={() => setSoloTrack((s) => (s === track.id ? null : track.id))}
                                            >
                                                <Icon name="headphones" size={13} />
                                            </TrackToolButton>
                                        </>
                                    )}
                                    <TrackToolButton
                                        tooltip={track.locked ? "Unlock this track" : "Lock this track"}
                                        isOn={!!track.locked}
                                        onClick={() => toggleTrackFlag(track.id, "locked")}
                                    >
                                        <Icon name={track.locked ? "lock" : "lock-open"} size={13} />
                                    </TrackToolButton>
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="cs-nle-scroll" ref={scrollRef}>
                    <div className="cs-nle-canvas" ref={canvasRef} style={{ width: canvasWidth }}>
                        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                        <div
                            className="cs-nle-ruler"
                            onPointerDown={startScrub}
                            {...gestureHandlers}
                        >
                            {rulerMarks.marks.map((t) => (
                                <span key={t} className="cs-nle-tick" style={{ left: msToX(t) }}>
                                    {formatClock(t)}
                                </span>
                            ))}
                        </div>

                        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                        <div
                            className="cs-nle-lanes"
                            ref={lanesRef}
                            onPointerDown={startLanePointer}
                            onContextMenu={(e) => openContextMenu(e, null)}
                            {...gestureHandlers}
                        >
                            {rulerMarks.marks.map((t) => (
                                <span key={t} className="cs-nle-gridline" style={{ left: msToX(t) }} aria-hidden />
                            ))}

                            {tracks.map((track) => (
                                <div
                                    key={track.id}
                                    data-track-id={track.id}
                                    className={`cs-nle-lane cs-nle-row--${track.type} ${track.locked ? "is-locked" : ""} ${track.visible === false ? "is-hidden" : ""}`}
                                    role="listbox"
                                    aria-label={`${trackLabels.get(track.id)} track`}
                                    aria-multiselectable="true"
                                >
                                    {track.items.map((item) => (
                                        <TimelineClip
                                            key={item._id}
                                            item={item}
                                            track={track}
                                            zoom={zoom}
                                            offsetMs={introMs}
                                            selected={selection.has(item._id) || marqueeHits.has(item._id)}
                                            editing={editingCue === item._id}
                                            gestureHandlers={gestureHandlers}
                                            onPointerDown={(e) => startClipDrag(e, item, track)}
                                            onTrimStart={(e) => startTrim(e, item, track, "start")}
                                            onTrimEnd={(e) => startTrim(e, item, track, "end")}
                                            onContextMenu={(e) => openContextMenu(e, item)}
                                            onEdit={() => setEditingCue(item._id)}
                                            onEditDone={(text) => {
                                                setEditingCue(null);
                                                if (text != null) updateCue(item._id, text);
                                            }}
                                        />
                                    ))}

                                    {isPictureTrack(track.type) && transitionMarks
                                        .filter((mark) => mark.trackId === track.id)
                                        .map((mark) => (
                                            <button
                                                key={mark.key}
                                                type="button"
                                                className={`cs-nle-xfade ${mark.dissolveMs ? "is-dissolve" : "is-cut"}`}
                                                style={{
                                                    left: msToX(mark.at + introMs),
                                                    ...(mark.dissolveMs
                                                        ? { "--xfade-w": `${Math.max(10, mark.dissolveMs * zoom)}px` }
                                                        : {}),
                                                }}
                                                title={mark.dissolveMs
                                                    ? `Dissolve ${mark.dissolveMs >= 1000 ? "1s" : `${mark.dissolveMs / 1000}s`} — click to change`
                                                    : "Cut — click to add dissolve"}
                                                aria-label={mark.dissolveMs
                                                    ? `Dissolve ${mark.dissolveMs} milliseconds`
                                                    : "Hard cut"}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => openContextMenu(e, { _id: mark.clipId })}
                                            >
                                                <span className="cs-nle-xfade-diamond" aria-hidden />
                                                {mark.dissolveMs ? (
                                                    <span className="cs-nle-xfade-label">
                                                        {mark.dissolveMs >= 1000 ? "1s" : `${mark.dissolveMs / 1000}s`}
                                                    </span>
                                                ) : (
                                                    <span className="cs-nle-xfade-label is-cut">Cut</span>
                                                )}
                                            </button>
                                        ))}

                                    {track.type === "zoom" && zoomMarks
                                        .filter((mark) => mark.trackId === track.id)
                                        .map((mark) => (
                                            <button
                                                key={mark.key}
                                                type="button"
                                                className={`cs-nle-xfade ${mark.transitionMs ? "is-dissolve" : "is-cut"}`}
                                                style={{
                                                    left: msToX(mark.at + introMs),
                                                    ...(mark.transitionMs
                                                        ? { "--xfade-w": `${Math.max(10, mark.transitionMs * zoom)}px` }
                                                        : {}),
                                                }}
                                                title={mark.transitionMs
                                                    ? `Zoom ${mark.edge} ${mark.transitionMs >= 1000 ? "1s" : `${mark.transitionMs / 1000}s`} — click to change`
                                                    : `Zoom ${mark.edge} — click to add a move`}
                                                aria-label={mark.transitionMs
                                                    ? `Zoom ${mark.edge} ${mark.transitionMs} milliseconds`
                                                    : `Instant zoom ${mark.edge}`}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => openContextMenu(e, { _id: mark.clipId })}
                                            >
                                                <span className="cs-nle-xfade-diamond" aria-hidden />
                                                {mark.transitionMs ? (
                                                    <span className="cs-nle-xfade-label">
                                                        {mark.transitionMs >= 1000 ? "1s" : `${mark.transitionMs / 1000}s`}
                                                    </span>
                                                ) : (
                                                    <span className="cs-nle-xfade-label is-cut">Cut</span>
                                                )}
                                            </button>
                                        ))}

                                    {!track.locked && (
                                        <button
                                            type="button"
                                            className="cs-nle-lane-add"
                                            style={{ left: msToX(rowEnd(track) + introMs) + 6 }}
                                            title={track.type === "subtitle"
                                                ? "Add a subtitle at the playhead"
                                                : isEffectTrack(track.type)
                                                    ? `Add ${TRACK_LABELS[track.type]} at the playhead`
                                                    : `Add media to ${trackLabels.get(track.id)}`}
                                            aria-label={track.type === "subtitle"
                                                ? "Add a subtitle at the playhead"
                                                : isEffectTrack(track.type)
                                                    ? `Add ${TRACK_LABELS[track.type]} at the playhead`
                                                    : `Add media to ${trackLabels.get(track.id)}`}
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={() => {
                                                if (track.type === "subtitle") addCue(track.id);
                                                else if (isEffectTrack(track.type)) addEffect(track.type, track.id);
                                                else openPicker(track);
                                            }}
                                        >
                                            <Icon name="plus" size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}

                            {dropHint && (
                                <div
                                    className={`cs-nle-drop ${dropHint.isNew ? "is-new" : ""}`}
                                    style={{
                                        left: msToX(dropHint.startMs + introMs),
                                        width: Math.max(4, (dropHint.endMs - dropHint.startMs) * zoom),
                                        top: dropHint.top,
                                        height: dropHint.height,
                                    }}
                                    aria-hidden
                                >
                                    {dropHint.isNew && <span className="cs-nle-drop-tag">New row</span>}
                                </div>
                            )}

                            {marquee && (
                                <div
                                    className="cs-nle-marquee"
                                    style={{
                                        left: marquee.left,
                                        top: marquee.top,
                                        width: marquee.width,
                                        height: marquee.height,
                                    }}
                                    aria-hidden
                                />
                            )}

                            {introMs > 0 && (
                                <div
                                    className="cs-nle-board-pad is-intro"
                                    style={{ left: 0, width: msToX(introMs) }}
                                    aria-hidden
                                />
                            )}
                            {outroMs > 0 && (
                                <div
                                    className="cs-nle-board-pad is-outro"
                                    style={{ left: msToX(introMs + contentBoardMs), width: msToX(outroMs) }}
                                    aria-hidden
                                />
                            )}

                            <div className="cs-nle-playhead" style={{ left: msToX(playheadBoardMs) }} aria-hidden>
                                <span className="cs-nle-playhead-cap" />
                            </div>
                            {guideMs != null && (
                                <div className="cs-nle-guide" style={{ left: msToX(guideMs) }} aria-hidden />
                            )}
                        </div>
                    </div>
                </div>
                </div>
                {renderAddTrackControl()}
            </div>

            {ctxMenu && ReactDOM.createPortal((
                <div
                    ref={ctxMenuRef}
                    className="cs-nle-ctx"
                    style={ctxMenuStyle}
                    role="menu"
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                >
                    <CtxItem shortcut="S" onPointerDown={runCtxAction(splitAtPlayhead)}>
                        Split at playhead
                    </CtxItem>
                    {zoomTarget ? (
                        <>
                            <CtxItem
                                isActive={!zoomTarget.transitionMs}
                                onPointerDown={runCtxAction(() => applyZoomTransition(zoomTarget.item._id, 0))}
                            >
                                Instant zoom (no move)
                            </CtxItem>
                            {TRANSITION_DURATION_MS.map((ms) => (
                                <CtxItem
                                    key={`zoom-${ms}`}
                                    isActive={zoomTarget.transitionMs === ms}
                                    onPointerDown={runCtxAction(() => applyZoomTransition(zoomTarget.item._id, ms))}
                                >
                                    Zoom in/out {ms === 1000 ? "1s" : `${ms / 1000}s`}
                                </CtxItem>
                            ))}
                            <div className="cs-nle-ctx-sep" role="separator" />
                        </>
                    ) : null}
                    {transitionTarget ? (
                        <>
                            <div className="cs-nle-ctx-sep" role="separator" />
                            <CtxItem
                                isActive={!transitionTarget.dissolveMs}
                                onPointerDown={runCtxAction(() => applyTransition(transitionTarget.item._id, null))}
                            >
                                Cut (no dissolve)
                            </CtxItem>
                            {TRANSITION_DURATION_MS.map((ms) => (
                                <CtxItem
                                    key={ms}
                                    isActive={transitionTarget.dissolveMs === ms}
                                    onPointerDown={runCtxAction(() => applyTransition(transitionTarget.item._id, {
                                        type: "dissolve",
                                        duration_ms: ms,
                                    }))}
                                >
                                    Dissolve {ms === 1000 ? "1s" : `${ms / 1000}s`}
                                </CtxItem>
                            ))}
                            <div className="cs-nle-ctx-sep" role="separator" />
                        </>
                    ) : null}
                    {audioSplit.detachable > 0 && (
                        <CtxItem onPointerDown={runCtxAction(splitClipAudio)}>
                            Split audio onto a row
                        </CtxItem>
                    )}
                    {audioSplit.detached > 0 && (
                        <CtxItem onPointerDown={runCtxAction(restoreClipAudio)}>
                            Put the audio back
                        </CtxItem>
                    )}
                    <CtxItem disabled={!selectionCount} onPointerDown={selectionCount ? runCtxAction(() => deleteSelected(true)) : undefined}>
                        Ripple delete
                    </CtxItem>
                    <CtxItem disabled={!selectionCount} onPointerDown={selectionCount ? runCtxAction(() => deleteSelected(false)) : undefined}>
                        Delete, leave gap
                    </CtxItem>
                    <CtxItem onPointerDown={runCtxAction(closeVideoGaps)}>
                        Close video gaps
                    </CtxItem>
                    <CtxItem onPointerDown={runCtxAction(addCue)}>
                        Add subtitle here
                    </CtxItem>
                    <CtxItem onPointerDown={runCtxAction(() => addEffect("zoom"))}>
                        Add zoom here
                    </CtxItem>
                    <CtxItem onPointerDown={runCtxAction(() => addEffect("spotlight"))}>
                        Add spotlight here
                    </CtxItem>
                    <CtxItem shortcut="]" onPointerDown={runCtxAction(selectAllToTheRight)}>
                        Select all to the right on this row
                    </CtxItem>
                    <CtxItem onPointerDown={runCtxAction(() => setSelection(new Set()))}>
                        Deselect
                    </CtxItem>
                </div>
            ), document.body)}

            {picker && (
                <AssetPicker
                    type={picker.type}
                    assets={assets}
                    uploading={uploading}
                    error={uploadError}
                    onPick={(draft) => placeDraft(picker.trackId, draft)}
                    onUpload={(file) => uploadToRow(picker.trackId, picker.type, file)}
                    onClose={() => setPicker(null)}
                />
            )}
        </div>
    );
}
