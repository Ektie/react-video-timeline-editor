import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon } from "./ui";
import { composeSourceCrop } from "./mediaCrop.js";
import {
    clipAt,
    clipSpeed,
    punchInCss,
    cropToRectCss,
    containBox,
    parseAspectRatio,
    normalizeEffectRect,
    pipOverlayCss,
    playableVideoUrl,
    isPictureOverlay,
    isSplitPair,
    splitLayers,
    splitPaneCss,
    resolveSubtitleFontFamily,
    livePicturePolish,
    videoWallPlan,
    wallPlanAt,
    wallToAbuttedMs,
    wallClockSpan,
    occupyingSpineTrack,
    canvasIntroMs,
    canvasPadMs,
    canvasPlateAt,
    contentWallMs,
    canvasInsetsPicture,
    canvasBackdropStyle,
    CANVAS_INSET,
    normalizeCanvas,
} from "./TimelineClipModel";
import { ensurePreviewFont } from "./fonts/ensurePreviewFont.js";

/** Re-seek only when we've drifted further than roughly one frame. */
const DRIFT_TOLERANCE_SEC = 0.08;

/** Visible rows of a type, top to bottom — which is also the priority order. */
function visibleRows(tracks, type) {
    return tracks.filter((t) => t.type === type && t.visible !== false);
}

/** Picture lanes (video + stills) in board order for the preview stack. */
function visiblePictureRows(tracks) {
    return tracks.filter((t) => (
        (t.type === "video" || t.type === "still") && t.visible !== false
    ));
}

function trackItems(tracks, type) {
    return visibleRows(tracks, type).flatMap((track) => track.items);
}

/**
 * The clip on screen at abutted `ms`: the first row from the top that has one.
 */
function videoAt(rows, ms) {
    for (const row of rows) {
        const item = clipAt(row.items, ms);
        if (item) return item;
    }
    return null;
}

const REGION_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_REGION = 0.05;

function stagePointFromEvent(event, el) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
}

function clampRegion(raw) {
    const w = Math.max(MIN_REGION, Math.min(1, Number(raw.w) || MIN_REGION));
    const h = Math.max(MIN_REGION, Math.min(1, Number(raw.h) || MIN_REGION));
    const x = Math.max(0, Math.min(1 - w, Number(raw.x) || 0));
    const y = Math.max(0, Math.min(1 - h, Number(raw.y) || 0));
    return { x, y, w, h };
}

function resizeRegion(startRect, startPt, pt, handle, lockAspect) {
    if (handle === "move") {
        return clampRegion({
            x: startRect.x + (pt.x - startPt.x),
            y: startRect.y + (pt.y - startPt.y),
            w: startRect.w,
            h: startRect.h,
        });
    }
    if (!lockAspect) {
        let x1 = startRect.x;
        let y1 = startRect.y;
        let x2 = startRect.x + startRect.w;
        let y2 = startRect.y + startRect.h;
        if (handle.includes("n")) y1 = pt.y;
        if (handle.includes("s")) y2 = pt.y;
        if (handle.includes("w")) x1 = pt.x;
        if (handle.includes("e")) x2 = pt.x;
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        return clampRegion({ x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
    }
    const cx = startRect.x + startRect.w / 2;
    const cy = startRect.y + startRect.h / 2;
    if (handle === "n" || handle === "s" || handle === "e" || handle === "w") {
        let side;
        if (handle === "e") side = pt.x - startRect.x;
        else if (handle === "w") side = (startRect.x + startRect.w) - pt.x;
        else if (handle === "s") side = pt.y - startRect.y;
        else side = (startRect.y + startRect.h) - pt.y;
        side = Math.max(MIN_REGION, side);
        const maxSide = Math.min(2 * cx, 2 * (1 - cx), 2 * cy, 2 * (1 - cy), 1);
        side = Math.min(side, maxSide);
        return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
    }
    const fixedX = handle.includes("w") ? startRect.x + startRect.w : startRect.x;
    const fixedY = handle.includes("n") ? startRect.y + startRect.h : startRect.y;
    let side = Math.max(MIN_REGION, Math.abs(pt.x - fixedX), Math.abs(pt.y - fixedY));
    let x = handle.includes("w") ? fixedX - side : fixedX;
    let y = handle.includes("n") ? fixedY - side : fixedY;
    if (x < 0) {
        side += x;
        x = 0;
    }
    if (y < 0) {
        side += y;
        y = 0;
    }
    if (x + side > 1) side = 1 - x;
    if (y + side > 1) side = 1 - y;
    side = Math.max(MIN_REGION, side);
    x = Math.max(0, Math.min(1 - side, x));
    y = Math.max(0, Math.min(1 - side, y));
    return { x, y, w: side, h: side };
}

function StageRegion({ kind, rect, lockAspect = false, onBegin, onLive, onCommit }) {
    const box = normalizeEffectRect(rect) || { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
    const dragRef = useRef(null);

    const spaceEl = (node) => node?.closest?.("[data-region-space]") || node?.closest?.(".cs-nle-stage");

    const onPointerDown = (event, handle) => {
        event.preventDefault();
        event.stopPropagation();
        const space = spaceEl(event.currentTarget);
        if (!space) return;
        const pt = stagePointFromEvent(event, space);
        if (!pt) return;
        dragRef.current = { handle, startPt: pt, startRect: box, moved: false };
        onBegin?.();
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const space = spaceEl(event.currentTarget);
        if (!space) return;
        const pt = stagePointFromEvent(event, space);
        if (!pt) return;
        drag.moved = true;
        onLive?.(resizeRegion(drag.startRect, drag.startPt, pt, drag.handle, lockAspect));
    };

    const onPointerUp = (event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        onCommit?.(drag.moved);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const bind = (handle) => ({
        onPointerDown: (event) => onPointerDown(event, handle),
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
    });

    return (
        <div
            className={`cs-nle-region ${kind === "spotlight" ? "is-spotlight" : "is-zoom"}`}
            style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
            }}
            {...bind("move")}
        >
            {REGION_HANDLES.map((handle) => (
                <span
                    key={handle}
                    className="cs-nle-region-handle"
                    data-handle={handle}
                    {...bind(handle)}
                />
            ))}
        </div>
    );
}

function subtitleStyleToCss(style = {}) {
    const normalized = style && typeof style === "object" ? style : {};
    const size = { sm: "2.6cqw", md: "3.4cqw", lg: "4.4cqw", xl: "5.6cqw" }[normalized.font_size || "md"] || "3.4cqw";
    const family = resolveSubtitleFontFamily(normalized.font_family);
    ensurePreviewFont(family);
    const vertical = normalized.position === "top"
        ? { top: "8%", bottom: "auto" }
        : normalized.position === "middle"
            ? { top: "50%", bottom: "auto", transform: "translateY(-50%)" }
            : { bottom: "10%", top: "auto" };
    return {
        ...vertical,
        fontSize: size,
        fontFamily: `"${family}", system-ui, sans-serif`,
        color: normalized.color || "#FFFFFF",
        background: normalized.background || "rgba(0,0,0,0.55)",
    };
}

/**
 * WYSIWYG preview for the Cuts timeline.
 *
 * Playhead time is wall-clock (dissolves compressed). The occupying spine
 * (`video-0`, at the bottom of the picture stack) uses a dual-buffer dissolve:
 * outgoing stays full, incoming fades up on top (true crossfade). Fading both
 * opacities over black dips mid-transition. Rows above the spine still hard-cut
 * as cutaways when they cover the base — unless the upper clip is an overlay
 * (PiP / graphic / cutout), in which case the base stays and the upper draws
 * as an inset. A split pair stacks both clips as cover-cropped halves.
 */
export default function TimelinePlayer({
    tracks,
    totalMs,
    currentMs,
    seekNonce,
    playing,
    rate = 1,
    muted = false,
    volume = 1,
    aspectRatio = "9:16",
    showSafeAreas = false,
    showSubtitles = true,
    onTimeUpdate,
    onPlayingChange,
    onSourceDuration,
    onCueClick,
    regionEdits = [],
    onRegionBegin,
    onRegionLive,
    onRegionCommit,
    onSplitPanBegin,
    onSplitPanLive,
    onSplitPanCommit,
    canvas = null,
}) {
    const canvasState = useMemo(() => normalizeCanvas(canvas), [canvas]);
    const introMs = canvasIntroMs(canvasState);
    const contentTotalMs = Math.max(0, totalMs - canvasPadMs(canvasState));
    const plate = canvasPlateAt(currentMs, canvasState, contentTotalMs);
    const sceneMs = plate ? (plate === "intro" ? 0 : contentTotalMs) : contentWallMs(currentMs, canvasState);
    const plateUrl = plate === "intro"
        ? canvasState.intro.image_url
        : plate === "outro"
            ? canvasState.outro.image_url
            : null;
    const inset = !plate && canvasInsetsPicture(canvasState) ? CANVAS_INSET : 0;

    const videoRows = useMemo(() => visiblePictureRows(tracks), [tracks]);
    const baseRow = useMemo(() => occupyingSpineTrack(videoRows) || (videoRows.length ? videoRows[videoRows.length - 1] : null), [videoRows]);
    const upperRows = useMemo(() => {
        const index = baseRow ? videoRows.indexOf(baseRow) : -1;
        return index >= 0 ? videoRows.slice(0, index) : videoRows.slice(0, -1);
    }, [videoRows, baseRow]);
    const videoItems = useMemo(() => videoRows.flatMap((row) => row.items), [videoRows]);
    const wallPlan = useMemo(() => videoWallPlan(baseRow?.items || []), [baseRow]);
    const abutMs = useMemo(() => wallToAbuttedMs(tracks, sceneMs), [tracks, sceneMs]);
    const upperHit = useMemo(() => videoAt(upperRows, abutMs), [upperRows, abutMs]);
    const splitPair = isSplitPair(upperHit) ? upperHit : null;
    const pipOverlay = !splitPair && isPictureOverlay(upperHit) ? upperHit : null;
    const cutaway = upperHit && !pipOverlay && !splitPair ? upperHit : null;
    const span = useMemo(() => wallPlanAt(wallPlan.spans, sceneMs), [wallPlan, sceneMs]);

    const audioClips = useMemo(() => (
        ["audio", "music"].flatMap((type) => (
            visibleRows(tracks, type).flatMap((row) => row.items.map((item) => ({
                item,
                type,
                muted: row.muted === true,
            })))
        )).filter(({ item }) => !!item.audio_url)
    ), [tracks]);
    const subtitleItems = useMemo(() => trackItems(tracks, "subtitle"), [tracks]);

    const dissolve = !cutaway && !pipOverlay && !splitPair && span?.kind === "dissolve" ? span : null;
    const baseUnderPip = (pipOverlay || splitPair)
        ? (span?.kind === "solo" ? span.item : (span?.kind === "dissolve" ? span.from : null))
        : null;
    const soloItem = cutaway
        || ((pipOverlay || splitPair) ? baseUnderPip : null)
        || (span?.kind === "solo" ? span.item : null);
    const dissolveProgress = dissolve
        ? Math.min(1, Math.max(0, (sceneMs - dissolve.wallStart) / Math.max(1, dissolve.durationMs)))
        : 0;

    const [failedSources, setFailedSources] = useState(() => new Set());
    const bufferA = useRef(null);
    const bufferB = useRef(null);
    const bufferPip = useRef(null);
    const bufferSplitTop = useRef(null);
    const bufferSplitBottom = useRef(null);
    const splitDragRef = useRef(null);
    const audioRefs = useRef(new Map());
    const rafRef = useRef(null);
    const wallClockRef = useRef(0);
    const currentMsRef = useRef(currentMs);
    currentMsRef.current = currentMs;

    const primary = dissolve ? dissolve.from : soloItem;
    const secondary = dissolve ? dissolve.to : null;
    const primarySrc = playableVideoUrl(primary?.video_url);
    const secondarySrc = playableVideoUrl(secondary?.video_url);
    const primaryStill = (!primarySrc && (primary?.keyframe_url || primary?.video_url)) || null;
    const secondaryStill = (!secondarySrc && (secondary?.keyframe_url || secondary?.video_url)) || null;
    const pipSrc = playableVideoUrl(pipOverlay?.video_url);
    const pipStill = pipOverlay && !pipSrc ? (pipOverlay.keyframe_url || pipOverlay.video_url) : null;
    const pipBox = useMemo(
        () => (pipOverlay ? pipOverlayCss(pipOverlay.pip) : null),
        [pipOverlay]
    );
    const splitPanes = useMemo(
        () => (splitPair && baseUnderPip ? splitLayers(splitPair, baseUnderPip) : null),
        [splitPair, baseUnderPip]
    );
    const splitTopSrc = playableVideoUrl(splitPanes?.top?.item?.video_url);
    const splitBottomSrc = playableVideoUrl(splitPanes?.bottom?.item?.video_url);
    const splitTopStill = splitPanes && !splitTopSrc
        ? (splitPanes.top.item?.keyframe_url || splitPanes.top.item?.video_url)
        : null;
    const splitBottomStill = splitPanes && !splitBottomSrc
        ? (splitPanes.bottom.item?.keyframe_url || splitPanes.bottom.item?.video_url)
        : null;
    const pictureItem = dissolve ? dissolve.from : soloItem;
    const editingZoom = !playing && regionEdits.some((edit) => edit.kind === "zoom");
    const polish = livePicturePolish(tracks, pictureItem, abutMs);
    const sourceCrop = pictureItem?.source_crop;
    const punchCss = editingZoom
        ? cropToRectCss(composeSourceCrop(sourceCrop, null))
        : (cropToRectCss(composeSourceCrop(sourceCrop, polish.zoomRect)) || punchInCss(polish.transform));
    const spotlight = polish.spotlight;
    const secondaryPolish = livePicturePolish(tracks, secondary, abutMs);
    const secondaryPunch = editingZoom
        ? cropToRectCss(composeSourceCrop(secondary?.source_crop, null))
        : (cropToRectCss(composeSourceCrop(secondary?.source_crop, secondaryPolish.zoomRect)) || punchInCss(secondaryPolish.transform));
    const [mediaAR, setMediaAR] = useState(null);
    const stageAR = parseAspectRatio(aspectRatio);
    const fit = containBox(stageAR, mediaAR || stageAR);
    const insetBox = inset
        ? { x: inset, y: inset, w: 1 - 2 * inset, h: 1 - 2 * inset }
        : { x: 0, y: 0, w: 1, h: 1 };
    const fitStyle = {
        left: `${(insetBox.x + fit.x * insetBox.w) * 100}%`,
        top: `${(insetBox.y + fit.y * insetBox.h) * 100}%`,
        width: `${fit.w * insetBox.w * 100}%`,
        height: `${fit.h * insetBox.h * 100}%`,
    };
    const zoomEdits = regionEdits.filter((edit) => edit.kind === "zoom");
    const spotlightEdits = regionEdits.filter((edit) => edit.kind === "spotlight");

    // Keep buffers pointed at primary / secondary / pip sources.
    useEffect(() => {
        const a = bufferA.current;
        const b = bufferB.current;
        const p = bufferPip.current;
        if (a) {
            if (primarySrc) {
                if (a.src !== primarySrc && !a.getAttribute("src")?.endsWith(primarySrc)) {
                    a.src = primarySrc;
                } else if (!a.src) {
                    a.src = primarySrc;
                }
            } else if (a.getAttribute("src")) {
                // Gap / no clip: drop the last frame so it cannot paint through.
                a.removeAttribute("src");
                a.load?.();
            }
        }
        if (b && secondarySrc) {
            if (!b.src || b.src !== secondarySrc) b.src = secondarySrc;
        } else if (b && !secondarySrc && b.getAttribute("src")) {
            b.removeAttribute("src");
            b.load?.();
        }
        if (p && pipSrc) {
            if (!p.src || p.src !== pipSrc) p.src = pipSrc;
        } else if (p && !pipSrc && p.getAttribute("src")) {
            p.removeAttribute("src");
            p.load?.();
        }
        const st = bufferSplitTop.current;
        const sb = bufferSplitBottom.current;
        if (st && splitTopSrc) {
            if (!st.src || st.src !== splitTopSrc) st.src = splitTopSrc;
        } else if (st && !splitTopSrc && st.getAttribute("src")) {
            st.removeAttribute("src");
            st.load?.();
        }
        if (sb && splitBottomSrc) {
            if (!sb.src || sb.src !== splitBottomSrc) sb.src = splitBottomSrc;
        } else if (sb && !splitBottomSrc && sb.getAttribute("src")) {
            sb.removeAttribute("src");
            sb.load?.();
        }
    }, [primarySrc, secondarySrc, pipSrc, splitTopSrc, splitBottomSrc, primary?._id, secondary?._id, pipOverlay?._id, splitPair?._id]);

    const syncMedia = useCallback((el, offsetSec, shouldPlay, elVolume, itemRate = 1) => {
        if (!el) return;
        el.playbackRate = Math.max(0.25, Math.min(16, rate * (itemRate || 1)));
        el.volume = Math.max(0, Math.min(1, elVolume));
        if (Number.isFinite(offsetSec) && Math.abs((el.currentTime || 0) - offsetSec) > DRIFT_TOLERANCE_SEC) {
            try {
                el.currentTime = Math.max(0, offsetSec);
            } catch (_) {
                /* seeking before metadata lands throws; the next tick retries */
            }
        }
        if (shouldPlay) {
            if (el.paused) el.play?.().catch(() => {});
        } else if (!el.paused) {
            el.pause?.();
        }
    }, [rate]);

    // Align video buffers with the wall-clock playhead.
    useEffect(() => {
        const a = bufferA.current;
        const b = bufferB.current;
        const p = bufferPip.current;
        if (dissolve && primary && secondary) {
            const fromSpeed = clipSpeed(dissolve.from?.speed);
            const toSpeed = clipSpeed(dissolve.to?.speed);
            const fromOff = (dissolve.fromSourceOffsetMs + (sceneMs - dissolve.wallStart) * fromSpeed) / 1000;
            const toOff = (dissolve.toSourceOffsetMs + (sceneMs - dissolve.wallStart) * toSpeed) / 1000;
            syncMedia(a, fromOff, playing && !plate, 0, fromSpeed);
            syncMedia(b, toOff, playing && !plate, 0, toSpeed);
            if (p && !p.paused) p.pause();
            return;
        }
        if (b && !b.paused) b.pause();
        if (!a || !soloItem) {
            if (a && !a.paused) a.pause();
        } else {
            const speed = clipSpeed(soloItem.speed);
            let offsetSec;
            if (span?.kind === "solo" && span.item === soloItem) {
                offsetSec = (span.sourceOffsetMs + (sceneMs - span.wallStart) * speed) / 1000;
            } else if (span?.kind === "dissolve" && pipOverlay && span.from === soloItem) {
                offsetSec = (span.fromSourceOffsetMs + (sceneMs - span.wallStart) * speed) / 1000;
            } else {
                offsetSec = ((abutMs - soloItem.startMs) * speed + (soloItem.trimIn || 0)) / 1000;
            }
            syncMedia(a, offsetSec, playing && !plate, 0, speed);
        }

        if (p && pipOverlay && pipSrc) {
            const pipSpeed = clipSpeed(pipOverlay.speed);
            const pipOff = ((abutMs - pipOverlay.startMs) * pipSpeed + (pipOverlay.trimIn || 0)) / 1000;
            syncMedia(p, pipOff, playing && !plate, 0, pipSpeed);
        } else if (p && !p.paused) {
            p.pause();
        }

        const syncSplitPane = (el, pane, src) => {
            if (!el) return;
            if (splitPanes && pane?.item && src) {
                const speed = clipSpeed(pane.item.speed);
                const off = ((abutMs - pane.item.startMs) * speed + (pane.item.trimIn || 0)) / 1000;
                syncMedia(el, off, playing && !plate, 0, speed);
            } else if (!el.paused) {
                el.pause();
            }
        };
        syncSplitPane(bufferSplitTop.current, splitPanes?.top, splitTopSrc);
        syncSplitPane(bufferSplitBottom.current, splitPanes?.bottom, splitBottomSrc);
    }, [dissolve, primary, secondary, soloItem, span, sceneMs, abutMs, playing, plate, syncMedia, pipOverlay, pipSrc, splitPanes, splitTopSrc, splitBottomSrc]);

    useEffect(() => {
        audioClips.forEach(({ item, type, muted: trackIsMuted }) => {
            const el = audioRefs.current.get(item._id);
            if (!el) return;
            // Voice/music stay on wall clock (same as export). Using abutted time
            // here skipped a dissolve-width chunk of audio whenever the playhead
            // crossed a cut, which sounded like a mute.
            const { wallStart, wallEnd } = wallClockSpan(tracks, item.startMs, item.durationMs);
            const within = !plate && sceneMs >= wallStart && sceneMs < wallEnd;
            const clipVolume = item.volume != null ? Number(item.volume) : (type === "music" ? 0.15 : 1);
            const speed = clipSpeed(item.speed);
            const offsetSec = ((sceneMs - wallStart) * speed + (item.trimIn || 0)) / 1000;
            syncMedia(
                el,
                offsetSec,
                playing && within,
                muted || trackIsMuted ? 0 : clipVolume * volume,
                speed
            );
        });
    }, [audioClips, tracks, sceneMs, plate, playing, muted, volume, syncMedia]);

    useEffect(() => {
        const a = bufferA.current;
        if (!a || (!soloItem && !dissolve)) return;
        // Hard seek when the editor moves the playhead.
        try {
            if (dissolve && primary) {
                const fromSpeed = clipSpeed(dissolve.from?.speed);
                a.currentTime = Math.max(0, (dissolve.fromSourceOffsetMs + (sceneMs - dissolve.wallStart) * fromSpeed) / 1000);
                if (bufferB.current && secondary) {
                    const toSpeed = clipSpeed(dissolve.to?.speed);
                    bufferB.current.currentTime = Math.max(
                        0,
                        (dissolve.toSourceOffsetMs + (sceneMs - dissolve.wallStart) * toSpeed) / 1000
                    );
                }
            } else if (soloItem) {
                const speed = clipSpeed(soloItem.speed);
                const offsetSec = span?.kind === "solo" && span.item === soloItem
                    ? (span.sourceOffsetMs + (sceneMs - span.wallStart) * speed) / 1000
                    : ((abutMs - soloItem.startMs) * speed + (soloItem.trimIn || 0)) / 1000;
                a.currentTime = Math.max(0, offsetSec);
            }
            if (bufferPip.current && pipOverlay && pipSrc) {
                const pipSpeed = clipSpeed(pipOverlay.speed);
                bufferPip.current.currentTime = Math.max(
                    0,
                    ((abutMs - pipOverlay.startMs) * pipSpeed + (pipOverlay.trimIn || 0)) / 1000
                );
            }
            if (bufferSplitTop.current && splitPanes?.top?.item && splitTopSrc) {
                const speed = clipSpeed(splitPanes.top.item.speed);
                bufferSplitTop.current.currentTime = Math.max(
                    0,
                    ((abutMs - splitPanes.top.item.startMs) * speed + (splitPanes.top.item.trimIn || 0)) / 1000
                );
            }
            if (bufferSplitBottom.current && splitPanes?.bottom?.item && splitBottomSrc) {
                const speed = clipSpeed(splitPanes.bottom.item.speed);
                bufferSplitBottom.current.currentTime = Math.max(
                    0,
                    ((abutMs - splitPanes.bottom.item.startMs) * speed + (splitPanes.bottom.item.trimIn || 0)) / 1000
                );
            }
        } catch (_) { /* metadata not ready yet */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seekNonce]);

    useEffect(() => {
        if (!playing) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            return undefined;
        }

        wallClockRef.current = performance.now();

        const tick = (now) => {
            const elapsed = (now - wallClockRef.current) * rate;
            wallClockRef.current = now;
            const next = currentMsRef.current + elapsed;

            if (next >= totalMs) {
                onTimeUpdate?.(totalMs);
                onPlayingChange?.(false);
                return;
            }

            currentMsRef.current = next;
            onTimeUpdate?.(next);
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [playing, rate, totalMs, onTimeUpdate, onPlayingChange]);

    const handleMetadata = useCallback((event, src) => {
        const el = event.currentTarget;
        const duration = el?.duration;
        if (Number.isFinite(duration) && duration > 0) {
            onSourceDuration?.(src, Math.round(duration * 1000));
        }
        const vw = el?.videoWidth;
        const vh = el?.videoHeight;
        if (vw > 0 && vh > 0) setMediaAR(vw / vh);
        const nw = el?.naturalWidth;
        const nh = el?.naturalHeight;
        if (nw > 0 && nh > 0) setMediaAR(nw / nh);
    }, [onSourceDuration]);

    const handleError = useCallback((src) => {
        setFailedSources((prev) => {
            if (prev.has(src)) return prev;
            const next = new Set(prev);
            next.add(src);
            return next;
        });
    }, []);

    const retryFailed = useCallback(() => {
        setFailedSources(new Set());
        [bufferA, bufferB, bufferPip, bufferSplitTop, bufferSplitBottom].forEach((ref) => ref.current?.load?.());
    }, []);

    const activeCue = useMemo(() => {
        if (!showSubtitles) return null;
        return subtitleItems.find((item) => {
            const { wallStart, wallEnd } = wallClockSpan(tracks, item.startMs, item.durationMs);
            return !plate && sceneMs >= wallStart && sceneMs < wallEnd;
        }) || null;
    }, [showSubtitles, subtitleItems, tracks, sceneMs, plate]);

    const inGap = !plate && !cutaway && !pipOverlay && !splitPair && !span;
    const hideFullFrame = !!splitPanes;
    const stillOnly = !hideFullFrame && !dissolve && !!soloItem && !playableVideoUrl(soloItem.video_url)
        && !!(soloItem.keyframe_url || soloItem.video_url);

    const beginSplitPan = useCallback((event, role, focus) => {
        if (!onSplitPanLive || playing) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const pane = event.currentTarget;
        splitDragRef.current = {
            role,
            startX: event.clientX,
            startY: event.clientY,
            startFocus: { ...focus },
            width: pane.clientWidth || 1,
            height: pane.clientHeight || 1,
            moved: false,
        };
        onSplitPanBegin?.();
    }, [onSplitPanBegin, onSplitPanLive, playing]);

    const moveSplitPan = useCallback((event) => {
        const drag = splitDragRef.current;
        if (!drag || !onSplitPanLive) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        const cx = Math.max(0, Math.min(1, drag.startFocus.cx - dx / drag.width));
        const cy = Math.max(0, Math.min(1, drag.startFocus.cy - dy / drag.height));
        onSplitPanLive(drag.role, { cx, cy });
    }, [onSplitPanLive]);

    const endSplitPan = useCallback((event) => {
        const drag = splitDragRef.current;
        if (!drag) return;
        try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch (_) { /* already released */ }
        splitDragRef.current = null;
        onSplitPanCommit?.(drag.moved);
    }, [onSplitPanCommit]);
    const primaryFailed = !!primarySrc && failedSources.has(primarySrc);

    return (
        <div
            className="cs-nle-stage"
            style={{
                "--stage-ar": aspectRatio.replace(":", " / "),
            }}
            data-empty={inGap ? "true" : undefined}
            data-region-space="stage"
        >
            <div className="cs-nle-stage-backdrop" style={canvasBackdropStyle(canvasState)} aria-hidden />
            {plateUrl ? (
                <img className="cs-nle-stage-plate" src={plateUrl} alt="" />
            ) : null}
            {/*
              Dissolve = true crossfade: keep the outgoing clip fully opaque and
              fade the incoming clip up on top. Fading both opacities over black
              dips mid-transition (reads as a fade-to-black, not a dissolve).
              Picture lives in the contain-box so zoom handles match the crop.
            */}
            <div className="cs-nle-stage-fit" data-region-space="fit" style={{ ...fitStyle, visibility: plate ? "hidden" : undefined }}>
                <video
                    ref={bufferA}
                    className="cs-nle-stage-media"
                    src={primarySrc || undefined}
                    playsInline
                    preload="auto"
                    muted
                    style={{ opacity: 1, ...(punchCss || {}) }}
                    hidden={hideFullFrame || !primarySrc || primaryFailed || inGap || stillOnly || (!!dissolve && !!primaryStill)}
                    onLoadedMetadata={(e) => primarySrc && handleMetadata(e, primarySrc)}
                    onError={() => primarySrc && handleError(primarySrc)}
                />
                {dissolve && primaryStill && !inGap && !hideFullFrame ? (
                    <img
                        className="cs-nle-stage-media"
                        src={primaryStill}
                        alt=""
                        style={{ opacity: 1, ...(punchCss || {}) }}
                        onLoad={(e) => handleMetadata(e, primaryStill)}
                    />
                ) : null}
                <video
                    ref={bufferB}
                    className="cs-nle-stage-media is-dissolve-in"
                    src={secondarySrc || undefined}
                    playsInline
                    preload="auto"
                    muted
                    style={{ opacity: dissolve && secondarySrc ? dissolveProgress : 0, ...(secondaryPunch || {}) }}
                    hidden={hideFullFrame || !dissolve || !secondarySrc || inGap || !!secondaryStill}
                    onLoadedMetadata={(e) => secondarySrc && handleMetadata(e, secondarySrc)}
                    onError={() => secondarySrc && handleError(secondarySrc)}
                />
                {dissolve && secondaryStill && !inGap && !hideFullFrame ? (
                    <img
                        className="cs-nle-stage-media is-dissolve-in"
                        src={secondaryStill}
                        alt=""
                        style={{ opacity: dissolveProgress, ...(secondaryPunch || {}) }}
                        onLoad={(e) => handleMetadata(e, secondaryStill)}
                    />
                ) : null}

                {stillOnly && !primaryFailed && (
                    <img
                        className="cs-nle-stage-media"
                        src={soloItem.keyframe_url || soloItem.video_url}
                        alt=""
                        style={punchCss}
                        onLoad={(e) => handleMetadata(e, soloItem.keyframe_url || soloItem.video_url)}
                    />
                )}

                {zoomEdits.map((edit) => (
                    <StageRegion
                        key={edit.id}
                        kind={edit.kind}
                        rect={edit.rect}
                        lockAspect
                        onBegin={onRegionBegin}
                        onLive={(rect) => onRegionLive?.(edit.id, rect)}
                        onCommit={onRegionCommit}
                    />
                ))}
            </div>

            {pipOverlay && pipBox && pipSrc && (
                <video
                    ref={bufferPip}
                    className="cs-nle-stage-pip"
                    src={pipSrc}
                    playsInline
                    preload="auto"
                    muted
                    style={pipBox}
                    onLoadedMetadata={(e) => handleMetadata(e, pipSrc)}
                    onError={() => handleError(pipSrc)}
                />
            )}
            {pipOverlay && pipBox && pipStill && !pipSrc && (
                <img className="cs-nle-stage-pip" src={pipStill} alt="" style={pipBox} />
            )}

            {splitPanes && (
                <div className="cs-nle-stage-split" aria-label="Split preview">
                    {["top", "bottom"].map((side) => {
                        const pane = splitPanes[side];
                        const src = side === "top" ? splitTopSrc : splitBottomSrc;
                        const still = side === "top" ? splitTopStill : splitBottomStill;
                        const ref = side === "top" ? bufferSplitTop : bufferSplitBottom;
                        const focus = pane.focus || { cx: 0.5, cy: 0.5 };
                        return (
                            <React.Fragment key={side}>
                                {side === "bottom" ? <div className="cs-nle-stage-split-rule" aria-hidden /> : null}
                                <div
                                    className="cs-nle-stage-split-pane"
                                    data-side={side}
                                    onPointerDown={(event) => beginSplitPan(event, pane.role, focus)}
                                    onPointerMove={moveSplitPan}
                                    onPointerUp={endSplitPan}
                                    onPointerCancel={endSplitPan}
                                >
                                    {src ? (
                                        <video
                                            ref={ref}
                                            src={src}
                                            playsInline
                                            preload="auto"
                                            muted
                                            style={splitPaneCss(focus)}
                                            onLoadedMetadata={(e) => handleMetadata(e, src)}
                                            onError={() => handleError(src)}
                                        />
                                    ) : still ? (
                                        <img
                                            src={still}
                                            alt=""
                                            style={splitPaneCss(focus)}
                                            onLoad={(e) => handleMetadata(e, still)}
                                        />
                                    ) : null}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {spotlight && !plate ? (
                <div className="cs-nle-spotlight" aria-hidden>
                    <div
                        className="cs-nle-spotlight-hole"
                        style={{
                            left: `${spotlight.x * 100}%`,
                            top: `${spotlight.y * 100}%`,
                            width: `${spotlight.w * 100}%`,
                            height: `${spotlight.h * 100}%`,
                        }}
                    />
                </div>
            ) : null}

            {spotlightEdits.map((edit) => (
                <StageRegion
                    key={edit.id}
                    kind={edit.kind}
                    rect={edit.rect}
                    onBegin={onRegionBegin}
                    onLive={(rect) => onRegionLive?.(edit.id, rect)}
                    onCommit={onRegionCommit}
                />
            ))}

            {audioClips.map(({ item }) => (
                <audio
                    key={item._id}
                    ref={(el) => {
                        if (el) audioRefs.current.set(item._id, el);
                        else audioRefs.current.delete(item._id);
                    }}
                    src={item.audio_url}
                    preload="auto"
                    onLoadedMetadata={(e) => handleMetadata(e, item.audio_url)}
                />
            ))}

            {showSafeAreas && <div className="cs-nle-safe" aria-hidden />}

            {activeCue && (onCueClick ? (
                <button
                    type="button"
                    className="cs-nle-caption is-clickable"
                    style={subtitleStyleToCss(activeCue.style)}
                    title="Edit the subtitles"
                    onClick={() => onCueClick(activeCue)}
                >
                    {activeCue.text || activeCue.label}
                </button>
            ) : (
                <div className="cs-nle-caption" style={subtitleStyleToCss(activeCue.style)}>
                    {activeCue.text || activeCue.label}
                </div>
            ))}

            {primaryFailed && (
                <div className="cs-nle-stage-note is-error" role="alert">
                    <Icon name="alert-triangle" size={18} />
                    <span>This clip’s video didn’t load.</span>
                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-md" onClick={retryFailed}>Retry</Button>
                </div>
            )}

            {inGap && !primaryFailed && (
                <div className="cs-nle-stage-note">
                    {videoItems.length ? "Gap — black frame" : "No clips on the timeline yet"}
                </div>
            )}
        </div>
    );
}
