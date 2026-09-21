/**
 * Clip model + pure reducers for the video timeline editor.
 *
 * THE CLIP CONTRACT (host renderers should mirror this JSON)
 *
     *   video / audio / music item:
     *     position  — where the clip starts on the timeline (ms)
     *     in / out  — offsets into the SOURCE media (ms)
     *     speed     — playback rate (Cuts UI offers 1 | 1.5 | 2 | 3; showcase
     *                 fit may store 0.25–16 so picture matches VO);
     *                 wall duration is (out - in) / speed
     *
     *   video item (optional):
     *     source_crop — { x, y, w, h } in 0–1 of the source. Applied before
     *       punch-in / zoom so a showcase recording crop fills the frame.
     *     transition_out — how this clip blends into the next abutted clip on the
 *       same row: { type: "cut"|"dissolve", duration_ms }. Clips stay abutted
 *       in JSON; dissolve overlap is subtracted from wall-clock length for
 *       preview + export (durA + durB - xfade), never by overlapping positions.
 *
 *   subtitle item:
 *     in / out  — absolute timeline times (ms); no position, no source
 *
 *   zoom / spotlight item:
 *     in / out  — absolute timeline times (ms); no media
 *     rect      — { x, y, w, h } in 0–1 of the source (the fitted video, not
 *                 letterbox bars). Zoom crops so this box fills the video
 *                 window; spotlight dims everything else on the stage.
 *     transition_ms — zoom only: how long to punch in at the start and punch
 *                 out at the end (0 = cut). Default 500.
 *
 * Items are always serialized sorted by position so array order can never
 * contradict time. The renderer relies on that.
 *
 * THE ROW CONTRACT
 *
 * A timeline holds several rows per type. A row is identified by `id`, never by
 * `type` — `type` only says what a row may hold and how it is drawn.
 *
 * Effect / audio / subtitle / music rows stay grouped by type. Picture rows
 * (video + still) are one stack: ARRAY ORDER IS PRIORITY, index 0 is the
 * topmost row and covers the rows beneath it wherever they overlap in time.
 * The occupying spine (`video-0`) sits at the BOTTOM of that stack. Overlay
 * stills and extra video sit above it, interleaved by `track_row` (higher
 * row closer to the top). New picture rows are inserted at the top of the
 * stack so a clip pushed onto one is visible rather than buried.
 *
 * Internally clips carry { startMs, durationMs, trimIn, trimOut, speed } because the
 * editor reasons in timeline space; serializeTracks() converts back. speed is a
 * playback rate (UI presets 1 | 1.5 | 2 | 3); wall duration is (trimOut - trimIn) / speed.
 *
 * Every reducer here is pure: it takes tracks and returns new tracks. No React,
 * no side effects — so the whole edit model is testable with plain asserts.
 */

export const TRACK_ORDER = ["zoom", "spotlight", "video", "still", "audio", "subtitle", "music"];

/** Board chrome around the picture stack. Picture (video+still) is interleaved. */
const BOARD_HEAD = ["zoom", "spotlight"];
const BOARD_TAIL = ["audio", "subtitle", "music"];

/** Types that always keep at least one empty row on the board. */
export const REQUIRED_TRACK_TYPES = ["video", "zoom", "spotlight", "audio", "subtitle", "music"];

export const TRACK_LABELS = {
    video: "Video",
    still: "Stills",
    zoom: "Zoom",
    spotlight: "Spotlight",
    audio: "Voice",
    subtitle: "Subs",
    music: "Music",
};

/** Picture rows (motion + stills) share the video render stack. */
export function isPictureTrack(type) {
    return type === "video" || type === "still";
}

/** Timed crop / highlight rows. No media — the player box is the edit. */
export function isEffectTrack(type) {
    return type === "zoom" || type === "spotlight";
}

/** Timeline-absolute clips with no source media (subs, zoom, spotlight). */
export function isCueTrack(type) {
    return type === "subtitle" || isEffectTrack(type);
}

/** Every picture row in board order — top of the list wins when times overlap. */
export function pictureTracks(tracks) {
    return (tracks || []).filter((track) => isPictureTrack(track.type));
}

/** Numeric `track_row` encoded in compiled ids like `still-2` / `video-1`. */
export function trackRowFromId(id) {
    const match = String(id || "").match(/^(?:video|still)-(\d+)$/);
    return match ? Number(match[1]) : null;
}

/**
 * Occupying spine: compiled `video-0`, else the bottom-most video row that
 * still has a full-frame (non-overlay) clip.
 */
export function occupyingSpineTrack(tracks) {
    const rows = pictureTracks(tracks);
    const byId = rows.find((track) => track.id === "video-0");
    if (byId) return byId;
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (row.type !== "video") continue;
        if ((row.items || []).some((item) => !isPictureOverlay(item))) return row;
    }
    const videos = rows.filter((track) => track.type === "video");
    return videos[videos.length - 1] || rows[rows.length - 1] || null;
}

/**
 * Overlay picture lanes above the spine. Higher compiled track_row is closer
 * to the top; unknown (user-added) ids stay on top; same row: stills above video.
 */
export function stackPictureTracks(tracks) {
    const pictures = pictureTracks(tracks);
    if (!pictures.length) return [];
    const spine = occupyingSpineTrack(pictures);
    const overlays = pictures
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => track !== spine);
    overlays.sort((a, b) => {
        const ra = trackRowFromId(a.track.id);
        const rb = trackRowFromId(b.track.id);
        const aKnown = ra !== null;
        const bKnown = rb !== null;
        if (aKnown !== bKnown) return aKnown ? 1 : -1;
        if (!aKnown && !bKnown) return a.index - b.index;
        if (ra !== rb) return rb - ra;
        if (a.track.type !== b.track.type) return a.track.type === "still" ? -1 : 1;
        return a.index - b.index;
    });
    const stacked = overlays.map(({ track }) => track);
    if (spine) stacked.push(spine);
    return stacked;
}

/** Shortest clip we allow; below this a clip is unclickable and unrenderable. */
export const MIN_CLIP_MS = 200;

export const CLIP_SPEEDS = [1, 1.5, 2, 3];
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 16;

/** Presets snap; other rates in 0.25–16 stay so picture can lock to VO. */
export function clipSpeed(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    const clamped = Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, n));
    for (const allowed of CLIP_SPEEDS) {
        if (Math.abs(clamped - allowed) < 0.01) return allowed;
    }
    return Math.round(clamped * 10000) / 10000;
}

export function sourceOutMs(item) {
    const speed = clipSpeed(item?.speed);
    const tin = Math.max(0, Number(item?.trimIn) || 0);
    const stored = Number(item?.trimOut);
    if (Number.isFinite(stored) && stored > tin) return stored;
    return tin + Math.round((Number(item?.durationMs) || 0) * speed);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i;

/** True when a URL can be the src of a <video>. Stills on video_url are not. */
export function isPlayableVideoUrl(url) {
    if (typeof url !== "string" || !url.trim()) return false;
    const path = url.split("?")[0].split("#")[0];
    if (IMAGE_EXT.test(path)) return false;
    return VIDEO_EXT.test(path);
}

export function playableVideoUrl(url) {
    return isPlayableVideoUrl(url) ? url : null;
}

/** Dissolve lengths the Cuts UI and agent tooling may pick. */
export const TRANSITION_DURATION_MS = [250, 500, 750, 1000];

export const DEFAULT_DISSOLVE_MS = 500;

/** Punch-in / punch-out length on a zoom clip when the user has not picked one. */
export const DEFAULT_ZOOM_TRANSITION_MS = 500;

export const FULL_FRAME_RECT = { x: 0, y: 0, w: 1, h: 1 };

/**
 * @param {unknown} raw
 * @returns {{ type: "cut"|"dissolve", duration_ms: number }|null}
 */
export function normalizeTransitionOut(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || "").toLowerCase() === "dissolve" ? "dissolve" : "cut";
    if (type === "cut") return null;
    let duration = Math.round(Number(raw.duration_ms) || DEFAULT_DISSOLVE_MS);
    if (!TRANSITION_DURATION_MS.includes(duration)) {
        duration = TRANSITION_DURATION_MS.reduce((best, candidate) => (
            Math.abs(candidate - duration) < Math.abs(best - duration) ? candidate : best
        ), DEFAULT_DISSOLVE_MS);
    }
    return { type: "dissolve", duration_ms: duration };
}

/** True when B starts where A ends (1ms tolerance for float/round noise). */
export function clipsAbut(a, b) {
    if (!a || !b) return false;
    return Math.abs(clipEnd(a) - b.startMs) <= 1;
}

/**
 * Dissolve ms from A into the next abutted clip, clamped to available handles.
 * @returns {number}
 */
export function effectiveDissolveMs(a, b) {
    const transition = a?.transitionOut || normalizeTransitionOut(a?.transition_out);
    if (!transition || transition.type !== "dissolve" || !clipsAbut(a, b)) return 0;
    const maxHandle = Math.min(
        Math.max(0, a.durationMs - MIN_CLIP_MS),
        Math.max(0, b.durationMs - MIN_CLIP_MS),
    );
    return Math.min(transition.duration_ms, maxHandle);
}

/**
 * Sum of dissolve overlaps on the base (bottom) video row.
 * Upper rows are cutaways and stay hard cuts.
 */
export function dissolveOverlapMs(tracks) {
    const rows = pictureTracks(tracks).filter((track) => track.visible !== false);
    if (!rows.length) return 0;
    const base = rows[rows.length - 1];
    const items = sortItems(base.items);
    let total = 0;
    for (let i = 0; i < items.length - 1; i++) {
        total += effectiveDissolveMs(items[i], items[i + 1]);
    }
    return total;
}

/** Wall-clock length after dissolving abutted cuts (matches export). */
export function wallClockTotalMs(tracks) {
    return Math.max(1000, totalFromTracks(tracks) - dissolveOverlapMs(tracks));
}

export const CANVAS_DEFAULT_COLOR = "#000000";
export const CANVAS_INSET = 0.08;
export const CANVAS_PLATE_DEFAULT_MS = 2000;
export const CANVAS_PLATE_MIN_MS = 500;
export const CANVAS_PLATE_MAX_MS = 6000;
export const CANVAS_ABSTRACT_PRESETS = {
    aurora: {
        label: "Aurora",
        base: "#1e1b4b",
        blobs: [[20, 30, "#7c3aed"], [80, 20, "#14b8a6"], [70, 80, "#f59e0b"]],
    },
    ocean: {
        label: "Ocean",
        base: "#0c4a6e",
        blobs: [[15, 80, "#22d3ee"], [85, 25, "#3b82f6"], [50, 50, "#6366f1"]],
    },
    sunset: {
        label: "Sunset",
        base: "#431407",
        blobs: [[20, 20, "#f97316"], [80, 30, "#ec4899"], [50, 85, "#eab308"]],
    },
    citrus: {
        label: "Citrus",
        base: "#14532d",
        blobs: [[25, 25, "#84cc16"], [75, 70, "#facc15"], [40, 80, "#34d399"]],
    },
};

function clampPlateMs(raw) {
    const ms = Math.round(Number(raw) || 0);
    const value = ms > 0 ? ms : CANVAS_PLATE_DEFAULT_MS;
    return Math.max(CANVAS_PLATE_MIN_MS, Math.min(CANVAS_PLATE_MAX_MS, value));
}

function hexColor(raw) {
    const text = String(raw || "").trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(text)) {
        return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    }
    return /^#[0-9a-f]{6}$/.test(text) ? text : CANVAS_DEFAULT_COLOR;
}

function nullableUrl(raw) {
    const text = String(raw || "").trim();
    return text || null;
}

function nullableId(raw) {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? Math.round(id) : null;
}

function emptyPlate(raw = {}) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
        image_url: nullableUrl(src.image_url || src.keyframe_url),
        image_asset_id: nullableId(src.image_asset_id || src.asset_id),
        frame_id: nullableId(src.frame_id),
        duration_ms: clampPlateMs(src.duration_ms ?? CANVAS_PLATE_DEFAULT_MS),
    };
}

/** Canonical Cuts canvas. Missing JSON = today's black full-bleed stage. */
export function normalizeCanvas(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const backdrop = src.backdrop && typeof src.backdrop === "object" ? src.backdrop : {};
    let mode = String(backdrop.mode || "color").toLowerCase();
    if (!["color", "image", "abstract"].includes(mode)) mode = "color";
    let preset = String(backdrop.abstract_preset || "aurora").toLowerCase();
    if (!CANVAS_ABSTRACT_PRESETS[preset]) preset = "aurora";
    const imageUrl = nullableUrl(backdrop.image_url);
    const color = hexColor(backdrop.color || CANVAS_DEFAULT_COLOR);
    const enabled = Object.prototype.hasOwnProperty.call(backdrop, "enabled")
        ? !!backdrop.enabled
        : legacyBackdropEnabled(mode, color, imageUrl);
    return {
        backdrop: {
            enabled,
            mode,
            color,
            image_url: imageUrl,
            image_asset_id: nullableId(backdrop.image_asset_id),
            frame_id: nullableId(backdrop.frame_id),
            abstract_preset: preset,
        },
        intro: emptyPlate(src.intro),
        outro: emptyPlate(src.outro),
    };
}

function legacyBackdropEnabled(mode, color, imageUrl) {
    if (mode === "abstract") return true;
    if (mode === "image") return !!imageUrl;
    return color !== CANVAS_DEFAULT_COLOR;
}

export function canvasBackdropActive(canvas) {
    const normalized = normalizeCanvas(canvas);
    if (!normalized.backdrop.enabled) return false;
    if (normalized.backdrop.mode === "image") return !!normalized.backdrop.image_url;
    return true;
}

export function canvasIntroMs(canvas) {
    const normalized = normalizeCanvas(canvas);
    return normalized.intro.image_url ? normalized.intro.duration_ms : 0;
}

export function canvasOutroMs(canvas) {
    const normalized = normalizeCanvas(canvas);
    return normalized.outro.image_url ? normalized.outro.duration_ms : 0;
}

export function canvasPadMs(canvas) {
    return canvasIntroMs(canvas) + canvasOutroMs(canvas);
}

export function wallClockWithCanvas(tracks, canvas) {
    return wallClockTotalMs(tracks) + canvasPadMs(canvas);
}

export function canvasInsetsPicture(canvas) {
    return canvasBackdropActive(canvas);
}

export function abstractCss(preset) {
    const recipe = CANVAS_ABSTRACT_PRESETS[preset] || CANVAS_ABSTRACT_PRESETS.aurora;
    const blobs = recipe.blobs.map(([x, y, color]) => (
        `radial-gradient(circle at ${x}% ${y}%, ${color} 0%, transparent 55%)`
    ));
    return [...blobs, recipe.base].join(", ");
}

export function canvasBackdropStyle(canvas) {
    const normalized = normalizeCanvas(canvas);
    if (!canvasBackdropActive(normalized)) {
        return { backgroundColor: CANVAS_DEFAULT_COLOR };
    }
    const { mode, color, image_url, abstract_preset } = normalized.backdrop;
    if (mode === "image" && image_url) {
        return {
            backgroundColor: color || "#000",
            backgroundImage: `url("${image_url}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    }
    if (mode === "abstract") {
        return { background: abstractCss(abstract_preset) };
    }
    return { backgroundColor: color || CANVAS_DEFAULT_COLOR };
}

/** Which plate the wall-clock playhead is on, if any. */
export function canvasPlateAt(wallMs, canvas, contentMs) {
    const intro = canvasIntroMs(canvas);
    if (wallMs < intro) return "intro";
    if (wallMs >= intro + Math.max(0, contentMs)) return canvasOutroMs(canvas) > 0 ? "outro" : null;
    return null;
}

export function contentWallMs(wallMs, canvas) {
    return Math.max(0, Math.round(wallMs) - canvasIntroMs(canvas));
}

/** Board x-position for a clip that still stores content-clock startMs. */
export function boardTimeWithCanvas(startMs, canvas) {
    return Math.max(0, startMs) + canvasIntroMs(canvas);
}

export function wallToBoardMs(tracks, wallMs, canvas) {
    const intro = canvasIntroMs(canvas);
    const content = wallClockTotalMs(tracks);
    const board = totalFromTracks(tracks);
    if (wallMs <= intro) return wallMs;
    if (wallMs >= intro + content) return intro + board + (wallMs - intro - content);
    return intro + wallToAbuttedMs(tracks, wallMs - intro);
}

export function boardToWallMs(tracks, boardMsPos, canvas) {
    const intro = canvasIntroMs(canvas);
    const content = wallClockTotalMs(tracks);
    const board = totalFromTracks(tracks);
    if (boardMsPos <= intro) return boardMsPos;
    if (boardMsPos >= intro + board) return intro + content + (boardMsPos - intro - board);
    return intro + abuttedToWallMs(tracks, boardMsPos - intro);
}

/**
 * Map an abutted timeline position to wall-clock ms (fully elapsed dissolves only).
 */
export function abuttedToWallMs(tracks, abutMs) {
    const cuts = [];
    const rows = pictureTracks(tracks).filter((track) => track.visible !== false);
    const base = rows[rows.length - 1];
    if (base) {
        const items = sortItems(base.items);
        for (let i = 0; i < items.length - 1; i++) {
            const d = effectiveDissolveMs(items[i], items[i + 1]);
            if (d > 0) cuts.push({ at: clipEnd(items[i]), amount: d });
        }
    }
    let wall = Math.max(0, abutMs);
    cuts.forEach((cut) => {
        if (abutMs >= cut.at) wall -= cut.amount;
    });
    return Math.max(0, wall);
}

/**
 * Where an abutted-timed clip (voice, music, cue) plays on the wall clock.
 * Matches export: slide the start left by elapsed dissolves, keep duration so
 * audio is not skipped across a dissolve the way a naive abut→wall inverse does.
 */
export function wallClockSpan(tracks, startMs, durationMs) {
    const wallStart = abuttedToWallMs(tracks, Math.max(0, startMs));
    const duration = Math.max(0, Number(durationMs) || 0);
    return { wallStart, wallEnd: wallStart + duration };
}

/**
 * Inverse of abuttedToWallMs for playhead mapping.
 */
export function wallToAbuttedMs(tracks, wallMs) {
    const totalAbut = totalFromTracks(tracks);
    let lo = 0;
    let hi = totalAbut;
    let best = Math.max(0, Math.min(totalAbut, wallMs));
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const w = abuttedToWallMs(tracks, mid);
        if (w < wallMs) {
            lo = mid + 1;
            best = mid;
        } else if (w > wallMs) {
            hi = mid - 1;
        } else {
            return mid;
        }
    }
    return Math.max(0, Math.min(totalAbut, best));
}

/**
 * Playback spans on one video row in wall-clock space.
 *
 * Empty board time (leading pad, gaps between clips) stays in the wall clock as
 * black — only dissolve overlaps between *abutted* clips are compressed. Packing
 * clips end-to-end made the preview paint Scene 1 while the playhead sat in a
 * gap before it.
 *
 * @returns {{ spans: object[], totalMs: number }}
 */
export function videoWallPlan(items) {
    const sorted = sortItems(items || []);
    const spans = [];
    let wall = 0;
    let abutCursor = 0;

    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const next = sorted[i + 1] || null;
        const outgoing = next ? effectiveDissolveMs(item, next) : 0;
        const incoming = i > 0 ? effectiveDissolveMs(sorted[i - 1], item) : 0;

        // Preserve empty board time before this clip (gaps / leading pad).
        if (item.startMs > abutCursor + 1) {
            wall += item.startMs - abutCursor;
        }

        const solo = Math.max(0, item.durationMs - incoming - outgoing);
        if (solo > 0) {
            spans.push({
                kind: "solo",
                item,
                wallStart: wall,
                wallEnd: wall + solo,
                sourceOffsetMs: (item.trimIn || 0) + incoming * clipSpeed(item.speed),
            });
            wall += solo;
        }
        if (outgoing > 0 && next) {
            spans.push({
                kind: "dissolve",
                from: item,
                to: next,
                wallStart: wall,
                wallEnd: wall + outgoing,
                fromSourceOffsetMs: (item.trimIn || 0) + (incoming + solo) * clipSpeed(item.speed),
                toSourceOffsetMs: next.trimIn || 0,
                durationMs: outgoing,
            });
            wall += outgoing;
        }
        abutCursor = clipEnd(item);
    }
    return { spans, totalMs: wall };
}

export function wallPlanAt(spans, wallMs) {
    for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        if (wallMs >= span.wallStart && wallMs < span.wallEnd) return span;
        if (i === spans.length - 1 && Math.abs(wallMs - span.wallEnd) < 0.5) return span;
    }
    return null;
}

/**
 * Snap a zoom in/out length. `0` / `null` is a hard cut; anything else lands
 * on the same ladder as dissolves.
 */
export function snapZoomTransitionMs(raw) {
    if (raw === 0 || raw === "0" || raw == null) return 0;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (TRANSITION_DURATION_MS.includes(n)) return n;
    return TRANSITION_DURATION_MS.reduce((best, candidate) => (
        Math.abs(candidate - n) < Math.abs(best - n) ? candidate : best
    ), DEFAULT_ZOOM_TRANSITION_MS);
}

/**
 * Zoom in/out ms on a clip. Missing means the default punch; explicit 0 is a cut.
 */
export function zoomTransitionMs(item) {
    if (item == null || typeof item !== "object") return DEFAULT_ZOOM_TRANSITION_MS;
    if (!Object.prototype.hasOwnProperty.call(item, "transitionMs")
        && !Object.prototype.hasOwnProperty.call(item, "transition_ms")) {
        return DEFAULT_ZOOM_TRANSITION_MS;
    }
    const raw = item.transitionMs ?? item.transition_ms;
    if (raw === undefined) return DEFAULT_ZOOM_TRANSITION_MS;
    return snapZoomTransitionMs(raw);
}

/** Half-clip clamp so a short zoom still punches in and out. */
export function zoomRampMs(item) {
    const dur = Math.max(0, Number(item?.durationMs) || 0);
    return Math.min(zoomTransitionMs(item), Math.floor(dur / 2));
}

export function setZoomTransition(tracks, clipId, durationMs) {
    const next = snapZoomTransitionMs(durationMs);
    return tracks.map((track) => {
        if (track.type !== "zoom") return track;
        return {
            ...track,
            items: track.items.map((item) => (
                item._id === clipId ? { ...item, transitionMs: next } : item
            )),
        };
    });
}

/**
 * Set or clear the outgoing transition on a video clip.
 */
export function setTransitionOut(tracks, clipId, transition) {
    const normalized = normalizeTransitionOut(transition);
    return tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        return {
            ...track,
            items: track.items.map((item) => {
                if (item._id !== clipId) return item;
                if (!normalized) {
                    const next = { ...item };
                    delete next.transitionOut;
                    return next;
                }
                return { ...item, transitionOut: normalized };
            }),
        };
    });
}

/**
 * Linear gain on an audio or music clip (0–4; Cuts UI caps at 2).
 * Speech auto-level in the renderer multiplies on top of this.
 */
export function setClipVolume(tracks, clipId, volume) {
    const v = Math.max(0, Math.min(4, Number(volume)));
    if (!Number.isFinite(v)) return tracks;
    return tracks.map((track) => {
        if (track.type !== "audio" && track.type !== "music") return track;
        return {
            ...track,
            items: track.items.map((item) => (
                item._id === clipId ? { ...item, volume: v } : item
            )),
        };
    });
}

export const PIP_CORNERS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
export const PIP_DEFAULT_CORNER = "br";
export const PIP_DEFAULT_SIZE = 0.33;
export const PIP_MIN_SIZE = 0.15;
export const PIP_MAX_SIZE = 0.55;
/** Matches host renderer PiP margin. */
export const PIP_MARGIN_FRAC = 0.03;
export const SPLIT_AXIS_HORIZONTAL = "horizontal";

/**
 * @returns {{ enabled: true, corner: string, size: number }|null}
 */
export function normalizePip(raw) {
    if (!raw || raw.enabled !== true) return null;
    const corner = PIP_CORNERS.includes(raw.corner) ? raw.corner : PIP_DEFAULT_CORNER;
    let size = Number(raw.size);
    if (!Number.isFinite(size)) size = PIP_DEFAULT_SIZE;
    size = Math.max(PIP_MIN_SIZE, Math.min(PIP_MAX_SIZE, size));
    return { enabled: true, corner, size: Math.round(size * 10000) / 10000 };
}

/** Extra picture layers that composite over the occupying clip, not cutaways. */
export function isPictureOverlay(item) {
    if (!item) return false;
    if (isSplitPair(item)) return false;
    if (pipExplicitlyDisabled(item.pip)) return false;
    if (normalizePip(item.pip)) return true;
    const mode = String(item.presentation_mode || "");
    if (mode === "pip" || mode === "cutout_compose" || mode === "graphic_overlay") return true;
    const role = String(item.visual_role || "");
    return role === "graphic" || role === "pip" || role === "pip_overlay"
        || role === "cutout" || role === "cutout_over_plate";
}

/** Human turned PiP off. Role/mode must not put the inset back. */
export function pipExplicitlyDisabled(pip) {
    return !!pip && Object.prototype.hasOwnProperty.call(pip, "enabled") && pip.enabled !== true;
}

/**
 * Enable/update or clear picture-in-picture on a video clip.
 * @param {object|null} pip  normalized pip, or null/false to clear
 */
export function setClipPip(tracks, clipId, pip) {
    const next = pip ? normalizePip({ ...pip, enabled: true }) : { enabled: false };
    return tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        return {
            ...track,
            items: track.items.map((item) => {
                if (item._id !== clipId) return item;
                if (!pip) {
                    return { ...item, pip: { enabled: false }, presentation_mode: "full_frame" };
                }
                const mode = item.visual_role === "graphic" ? "graphic_overlay" : "pip";
                return {
                    ...item,
                    pip: next,
                    split: { enabled: false },
                    presentation_mode: mode,
                };
            }),
        };
    });
}

export function normalizeTransform(raw) {
    if (!raw || typeof raw !== "object") return null;
    const scale = Number(raw.scale);
    if (!Number.isFinite(scale) || scale < 1.04) return null;
    const cx = Math.max(0, Math.min(1, Number(raw.cx)));
    const cy = Math.max(0, Math.min(1, Number(raw.cy)));
    return {
        scale: Math.round(Math.max(1.05, Math.min(4, scale)) * 10000) / 10000,
        cx: Number.isFinite(cx) ? cx : 0.5,
        cy: Number.isFinite(cy) ? cy : 0.5,
    };
}

export function normalizeSpotlight(raw) {
    if (!raw || typeof raw !== "object") return null;
    const x = Math.max(0, Math.min(1, Number(raw.x)));
    const y = Math.max(0, Math.min(1, Number(raw.y)));
    const w = Math.max(0, Math.min(1, Number(raw.w)));
    const h = Math.max(0, Math.min(1, Number(raw.h)));
    if (!Number.isFinite(x) || !Number.isFinite(y) || w < 0.05 || h < 0.05) return null;
    return { x, y, w, h };
}

/** Zoom / spotlight region. Same shape as a spotlight hole. */
export function normalizeEffectRect(raw) {
    return normalizeSpotlight(raw);
}

/** Source-space crop of an uploaded recording. Full-frame is a no-op. */
export function clipSourceCrop(raw) {
    const r = normalizeEffectRect(raw);
    if (!r || (r.w >= 0.999 && r.h >= 0.999)) return null;
    const w = Math.min(r.w, 1 - r.x);
    const h = Math.min(r.h, 1 - r.y);
    if (w < 0.05 || h < 0.05) return null;
    return { x: r.x, y: r.y, w, h };
}

/**
 * Zoom crop window in source space. Equal fractions keep the source aspect so
 * the box is the region that fills the video window (no stretch).
 */
export function normalizeZoomRect(raw) {
    const r = normalizeEffectRect(raw);
    if (!r) return null;
    const side = Math.min(r.w, r.h);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const x = Math.max(0, Math.min(1 - side, cx - side / 2));
    const y = Math.max(0, Math.min(1 - side, cy - side / 2));
    return { x, y, w: side, h: side };
}

export const DEFAULT_EFFECT_RECT = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };

export const DEFAULT_EFFECT_MS = 3000;

export function lerpRect(a, b, p) {
    const t = Math.max(0, Math.min(1, Number(p) || 0));
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t,
    };
}

export function smoothstep01(t) {
    const p = Math.max(0, Math.min(1, Number(t) || 0));
    return p * p * (3 - 2 * p);
}

/**
 * 0 = full frame, 1 = fully inside the zoom box.
 * Ramps up at the clip start and back down at the end so playback punches
 * into the area and out of it.
 */
export function zoomAmountAt(item, ms) {
    if (!item) return 0;
    const start = item.startMs;
    const end = clipEnd(item);
    if (!(ms >= start && ms < end)) return 0;
    const ramp = zoomRampMs(item);
    if (ramp <= 0) return 1;
    const into = ms - start;
    const remain = end - ms;
    let amount = 1;
    if (into < ramp) amount = smoothstep01(into / ramp);
    if (remain < ramp) amount = Math.min(amount, smoothstep01(remain / ramp));
    return amount;
}

/** Live source-space crop at `ms` (full frame when there is no zoom). */
export function liveZoomRect(tracks, ms) {
    const zoom = effectAt(tracks, "zoom", ms);
    if (!zoom) return null;
    const target = normalizeZoomRect(zoom.item.rect) || DEFAULT_EFFECT_RECT;
    return lerpRect(FULL_FRAME_RECT, target, zoomAmountAt(zoom.item, ms));
}

/**
 * Place the source so `rect` fills the fitted video window. Applied on the
 * contain-box, not the letterboxed stage — otherwise the handle and the crop
 * disagree.
 */
export function cropToRectCss(rect) {
    const r = rect && typeof rect === "object" ? rect : null;
    if (!r) return undefined;
    const w = Number(r.w);
    const h = Number(r.h);
    const x = Number(r.x);
    const y = Number(r.y);
    if (!(w > 0) || !(h > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    if (w >= 0.999 && h >= 0.999) return undefined;
    return {
        position: "absolute",
        inset: "auto",
        left: `${(-x / w) * 100}%`,
        top: `${(-y / h) * 100}%`,
        width: `${(100 / w)}%`,
        height: `${(100 / h)}%`,
        objectFit: "fill",
    };
}

/** Letterbox a media frame inside a stage of `stageAR` (width/height). */
export function containBox(stageAR, mediaAR) {
    const stage = Number(stageAR);
    const media = Number(mediaAR);
    if (!(stage > 0) || !(media > 0) || Math.abs(media - stage) < 0.008) {
        return { x: 0, y: 0, w: 1, h: 1 };
    }
    if (media > stage) {
        const h = stage / media;
        return { x: 0, y: (1 - h) / 2, w: 1, h };
    }
    const w = media / stage;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

export function parseAspectRatio(spec, fallback = 9 / 16) {
    const parts = String(spec || "").split(":").map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1];
    const n = Number(spec);
    return n > 0 ? n : fallback;
}

/**
 * Tight named-control box. Planner leftover only — user-drawn zoom clips
 * may be any size the handle allows.
 */
export function isPunchInRect(rect) {
    const r = normalizeEffectRect(rect);
    if (!r) return false;
    if (r.w < 0.06 || r.h < 0.06) return false;
    if (r.w > 0.42 || r.h > 0.42) return false;
    return (r.w * r.h) <= 0.12;
}

/** Crop-to-rect → ffmpeg punch-in { scale, cx, cy }. The box fills the frame. */
export function transformFromRect(rect) {
    const r = normalizeEffectRect(rect);
    if (!r) return null;
    const span = Math.min(r.w, r.h);
    if (!(span > 0)) return null;
    return normalizeTransform({
        scale: 1 / span,
        cx: r.x + r.w / 2,
        cy: r.y + r.h / 2,
    });
}

/** Inverse of transformFromRect for lifting leftover video-clip punch-ins. */
export function rectFromTransform(transform) {
    const t = normalizeTransform(transform);
    if (!t) return null;
    const size = 1 / t.scale;
    return normalizeEffectRect({
        x: t.cx - size / 2,
        y: t.cy - size / 2,
        w: size,
        h: size,
    });
}

export function punchInCss(transform) {
    const t = normalizeTransform(transform);
    if (!t) return undefined;
    return {
        transform: `scale(${t.scale})`,
        transformOrigin: `${t.cx * 100}% ${t.cy * 100}%`,
        objectFit: "cover",
    };
}

export function setClipSpeed(tracks, clipId, speed) {
    const nextSpeed = clipSpeed(speed);
    return tracks.map((track) => {
        if (isCueTrack(track.type)) return track;
        let originalEnd = null;
        let lengthDelta = 0;
        const items = track.items.map((item) => {
            if (item._id !== clipId) return item;
            const srcLen = Math.max(MIN_CLIP_MS, sourceOutMs(item) - (item.trimIn || 0));
            const nextDuration = Math.max(MIN_CLIP_MS, Math.round(srcLen / nextSpeed));
            originalEnd = clipEnd(item);
            lengthDelta = nextDuration - item.durationMs;
            return {
                ...item,
                speed: nextSpeed,
                durationMs: nextDuration,
                trimOut: (item.trimIn || 0) + srcLen,
            };
        });
        if (originalEnd == null || lengthDelta === 0) {
            return { ...track, items };
        }
        return {
            ...track,
            items: items.map((item) => (
                item.startMs >= originalEnd
                    ? { ...item, startMs: Math.max(0, item.startMs + lengthDelta) }
                    : item
            )),
        };
    });
}

export function setClipTransform(tracks, clipId, transform) {
    const next = transform ? normalizeTransform(transform) : null;
    return tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        return {
            ...track,
            items: track.items.map((item) => {
                if (item._id !== clipId) return item;
                if (!next) {
                    const copy = { ...item };
                    delete copy.transform;
                    return copy;
                }
                return { ...item, transform: next };
            }),
        };
    });
}

export function setClipSpotlight(tracks, clipId, spotlight) {
    const next = spotlight ? normalizeSpotlight(spotlight) : null;
    return tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        return {
            ...track,
            items: track.items.map((item) => {
                if (item._id !== clipId) return item;
                if (!next) {
                    const copy = { ...item };
                    delete copy.spotlight;
                    return copy;
                }
                return { ...item, spotlight: next };
            }),
        };
    });
}

export function setEffectRect(tracks, clipId, rect) {
    return tracks.map((track) => {
        if (!isEffectTrack(track.type)) return track;
        return {
            ...track,
            items: track.items.map((item) => {
                if (item._id !== clipId) return item;
                if (!rect) {
                    const copy = { ...item };
                    delete copy.rect;
                    return copy;
                }
                const next = track.type === "zoom"
                    ? normalizeZoomRect(rect)
                    : normalizeEffectRect(rect);
                return { ...item, rect: next || item.rect };
            }),
        };
    });
}

/**
 * CSS/percent placement for a PiP inset.
 * Returns fractions of the stage (0–1) for left/top/width/height.
 * Corner is a 9-point grid: tl|tc|tr|ml|mc|mr|bl|bc|br.
 */
export function pipOverlayCss(pip) {
    const normalized = normalizePip({ ...(pip || {}), enabled: true }) || {
        corner: PIP_DEFAULT_CORNER,
        size: PIP_DEFAULT_SIZE,
    };
    const margin = PIP_MARGIN_FRAC;
    const width = Math.min(normalized.size, 1 - 2 * margin);
    // Same AR as the stage: height% = width% (both relative to their axes when
    // the stage itself has the delivery aspect — width is % of width, height
    // of height, so equal fractions keep the canvas AR).
    const height = width;
    const horiz = normalized.corner[1]; // l|c|r
    const vert = normalized.corner[0]; // t|m|b
    const left = horiz === "l"
        ? margin
        : horiz === "c"
            ? Math.max(margin, (1 - width) / 2)
            : Math.max(margin, 1 - margin - width);
    const top = vert === "t"
        ? margin
        : vert === "m"
            ? Math.max(margin, (1 - height) / 2)
            : Math.max(margin, 1 - margin - height);
    return {
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
    };
}

export function splitExplicitlyDisabled(split) {
    return !!split && Object.prototype.hasOwnProperty.call(split, "enabled") && split.enabled !== true;
}

export function normalizeSplitFocus(raw) {
    const cx = Math.max(0, Math.min(1, Number(raw?.cx)));
    const cy = Math.max(0, Math.min(1, Number(raw?.cy)));
    return {
        cx: Number.isFinite(cx) ? Math.round(cx * 10000) / 10000 : 0.5,
        cy: Number.isFinite(cy) ? Math.round(cy * 10000) / 10000 : 0.5,
    };
}

/**
 * @returns {{ enabled: true, axis: string, swap: boolean, self: {cx:number,cy:number}, peer: {cx:number,cy:number} }|null}
 */
export function normalizeSplit(raw) {
    if (!raw || splitExplicitlyDisabled(raw) || raw.enabled !== true) return null;
    return {
        enabled: true,
        axis: SPLIT_AXIS_HORIZONTAL,
        swap: !!raw.swap,
        self: normalizeSplitFocus(raw.self),
        peer: normalizeSplitFocus(raw.peer),
    };
}

export function isSplitPair(item) {
    if (!item) return false;
    if (splitExplicitlyDisabled(item.split)) return false;
    if (normalizeSplit(item.split)) return true;
    return String(item.presentation_mode || "") === "split";
}

/**
 * Enable/update or clear a top/bottom split on an upper-row clip.
 * @param {object|null} split  normalized split, or null/false to clear
 */
export function setClipSplit(tracks, clipId, split) {
    const next = split ? normalizeSplit({ ...split, enabled: true }) : { enabled: false };
    return tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        return {
            ...track,
            items: track.items.map((item) => {
                if (item._id !== clipId) return item;
                if (!split) {
                    return { ...item, split: { enabled: false }, presentation_mode: "full_frame" };
                }
                return {
                    ...item,
                    split: next,
                    pip: { enabled: false },
                    presentation_mode: "split",
                };
            }),
        };
    });
}

/** object-position for a cover-fit split pane. */
export function splitPaneCss(focus) {
    const { cx, cy } = normalizeSplitFocus(focus);
    return {
        objectFit: "cover",
        objectPosition: `${cx * 100}% ${cy * 100}%`,
    };
}

/** Upper-row split clip covering abutted `ms`, if any. */
export function splitClipAt(tracks, ms) {
    const rows = pictureTracks(tracks);
    const base = occupyingSpineTrack(rows) || (rows.length ? rows[rows.length - 1] : null);
    if (!base) return null;
    for (const row of rows) {
        if (row === base) continue;
        const item = clipAt(row.items, ms);
        if (item && isSplitPair(item)) return item;
    }
    return null;
}

/** Overlay clip owns the split JSON. Default: overlay on top, base on bottom. */
export function splitLayers(overlayItem, baseItem) {
    const split = normalizeSplit(overlayItem?.split) || normalizeSplit({ enabled: true }) || {
        enabled: true,
        axis: SPLIT_AXIS_HORIZONTAL,
        swap: false,
        self: { cx: 0.5, cy: 0.5 },
        peer: { cx: 0.5, cy: 0.5 },
    };
    const self = { item: overlayItem, focus: split.self, role: "self" };
    const peer = { item: baseItem, focus: split.peer, role: "peer" };
    return split.swap
        ? { split, top: peer, bottom: self }
        : { split, top: self, bottom: peer };
}

export function uid() {
    return `c_${Math.random().toString(36).slice(2, 10)}`;
}

export function trackUid(type) {
    return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Every row of a type, top to bottom — which is also highest to lowest priority. */
export function tracksOfType(tracks, type) {
    return tracks.filter((track) => track.type === type);
}

export function findTrack(tracks, trackId) {
    return tracks.find((track) => track.id === trackId) || null;
}

/**
 * Display name for a row. Rows are numbered from the BOTTOM so the base layer
 * is always "Video 1" and anything stacked on top of it reads as a higher
 * number, the way an NLE numbers V1/V2. A lone row of a type drops the number.
 */
export function trackLabel(tracks, track) {
    const group = tracksOfType(tracks, track.type);
    const base = TRACK_LABELS[track.type] || track.type;
    if (group.length < 2) return base;
    return `${base} ${group.length - group.indexOf(track)}`;
}

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** Meaning label when the clip carries blueprint v2 semantics and no stored label. */
function clipMeaningLabel(source) {
    const role = String(source.visual_role || "").trim();
    if (role === "chapter_banner") {
        const fromKey = String(source.item_key || source.subject_id || "").match(/(\d+)/);
        const index = Math.max(1, Number(source.chapter_index || fromKey?.[1] || 1));
        const n = String(index).padStart(2, "0");
        const title = String(source.narrative_purpose || source.information_added || "").trim();
        return title ? `Chapter ${n} · ${title}` : `Chapter ${n}`;
    }
    const purpose = String(source.narrative_purpose || "").trim();
    const subject = String(source.subject_id || "").replace(/_/g, " ");
    const klass = String(source.asset_class || "").replace(/_/g, " ");
    if (!purpose && !subject && !klass && !source.presentation_mode) {
        return "";
    }
    const head = purpose || subject || klass || "scene";
    const mode = source.presentation_mode;
    let suffix = "layer";
    if (mode === "pip") suffix = "PiP";
    else if (mode === "split") suffix = "split";
    else if (mode === "cutout_compose") suffix = "cutout";
    else if (mode === "graphic_overlay") suffix = "overlay";
    else if (mode === "hold") suffix = "hold";
    else if (source.extends_timeline) suffix = "base";
    return `${head.charAt(0).toUpperCase()}${head.slice(1)} — ${suffix}`;
}

export function isTimedTrack(type) {
    return type === "video" || type === "still" || type === "audio" || type === "music";
}

export function normalizeItem(raw, trackType) {
    const source = raw || {};
    let startMs;
    let durationMs;
    let trimIn = 0;
    let trimOut = null;

    if (isCueTrack(trackType)) {
        // Subs / zoom / spotlight are absolute: in/out are timeline times.
        startMs = Math.max(0, num(source.in, num(source.position)));
        const end = num(source.out, NaN);
        durationMs = Number.isFinite(end) && end > startMs
            ? end - startMs
            : num(source.duration_ms, num(source.durationMs, isEffectTrack(trackType) ? DEFAULT_EFFECT_MS : 2000));
        trimIn = 0;
        trimOut = durationMs;
    } else {
        startMs = Math.max(0, num(source.position));
        const tin = Math.max(0, num(source.in));
        const tout = num(source.out, NaN);
        const speed = clipSpeed(source.speed);
        if (Number.isFinite(tout) && tout > tin) {
            trimIn = tin;
            trimOut = tout;
            durationMs = Math.round((tout - tin) / speed);
        } else {
            durationMs = num(source.duration_ms, 3000);
            trimIn = tin;
            trimOut = tin + Math.round(durationMs * speed);
        }
    }

    durationMs = Math.max(MIN_CLIP_MS, durationMs);

    return {
        _id: source._id || uid(),
        startMs,
        durationMs,
        trimIn,
        trimOut: trimOut ?? trimIn + durationMs,
        // Length of the underlying media, when known. Trims clamp to it; the
        // player reports it back once metadata loads.
        sourceDurationMs: Number.isFinite(num(source.source_duration_ms, NaN))
            ? num(source.source_duration_ms)
            : null,
        label: source.label || source.text || clipMeaningLabel(source) || source.segment_key || TRACK_LABELS[trackType] || trackType,
        text: source.text || "",
        video_url: source.video_url || null,
        keyframe_url: source.keyframe_url || null,
        audio_url: source.audio_url || null,
        audio_owner: source.audio_owner || null,
        // A video clip whose sound has been lifted onto an audio row. The row
        // is what plays and what renders; the flag only stops a second lift and
        // tells the clip to say why it is quiet.
        audioDetached: source.audio_detached === true,
        liftedFrom: source.lifted_from || source.liftedFrom || null,
        role: source.role || null,
        scene_id: source.scene_id,
        frame_id: source.frame_id,
        asset_id: source.asset_id,
        usage_id: source.usage_id,
        voiceover_id: source.voiceover_id,
        volume: source.volume,
        style: source.style,
        transitionOut: normalizeTransitionOut(source.transition_out || source.transitionOut),
        pip: pipExplicitlyDisabled(source.pip) ? { enabled: false } : normalizePip(source.pip),
        split: splitExplicitlyDisabled(source.split) ? { enabled: false } : normalizeSplit(source.split),
        speed: clipSpeed(source.speed),
        transform: isPictureTrack(trackType) ? normalizeTransform(source.transform) : null,
        source_crop: isPictureTrack(trackType) ? clipSourceCrop(source.source_crop) : null,
        spotlight: isPictureTrack(trackType) ? normalizeSpotlight(source.spotlight) : null,
        rect: isEffectTrack(trackType)
            ? (trackType === "zoom"
                ? (normalizeZoomRect(source.rect)
                    || (source.rect == null && source.x != null ? normalizeZoomRect(source) : null))
                : (normalizeEffectRect(source.rect)
                    || (source.rect == null && source.x != null ? normalizeEffectRect(source) : null)))
            : null,
        transitionMs: trackType === "zoom" ? zoomTransitionMs(source) : undefined,
        item_key: source.item_key || null,
        visual_role: source.visual_role || null,
        asset_class: source.asset_class || null,
        subject_id: source.subject_id || null,
        presentation_mode: source.presentation_mode || null,
        narrative_purpose: source.narrative_purpose || null,
        information_added: source.information_added || null,
        base_item_key: source.base_item_key || null,
        exclusive_group: source.exclusive_group || null,
        generation_status: source.generation_status || null,
        placeholder: source.placeholder === true,
        required: source.required !== false,
        _trackType: trackType,
    };
}

export function clipEnd(item) {
    return item.startMs + item.durationMs;
}

function sortItems(items) {
    return [...items].sort(
        (a, b) => a.startMs - b.startMs || String(a._id).localeCompare(String(b._id))
    );
}

/** True when any two clips on the track occupy the same instant. */
export function trackHasOverlap(items) {
    const sorted = sortItems(items);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startMs < clipEnd(sorted[i - 1]) - 1) return true;
    }
    return false;
}

/**
 * Rows holding two clips at the same instant. Across rows that is legal now —
 * the upper row simply wins — so this only reports collisions WITHIN a row,
 * which the renderer has to resolve by trimming.
 */
export function overlappingTrackIds(tracks) {
    return tracks
        .filter((t) => isPictureTrack(t.type) && trackHasOverlap(t.items))
        .map((t) => t.id);
}

/** Sort by start and abut every clip from zero, closing all gaps. */
export function closeGaps(tracks, trackId) {
    return tracks.map((track) => {
        if (track.id !== trackId) return track;
        let cursor = 0;
        const items = sortItems(track.items).map((item) => {
            const next = { ...item, startMs: cursor };
            cursor += item.durationMs;
            return next;
        });
        return { ...track, items };
    });
}

/** Back-compat alias used by the contract test and older callers. */
export function packVideoClips(items, { force = false } = {}) {
    const sorted = sortItems(items);
    if (!force && !trackHasOverlap(sorted)) return sorted;
    let cursor = 0;
    return sorted.map((item) => {
        const next = { ...item, startMs: cursor };
        cursor += item.durationMs;
        return next;
    });
}

function emptyTrack(type, id) {
    return {
        id,
        type,
        visible: true,
        muted: false,
        locked: false,
        ...(type === "subtitle" ? { captionStyle: { ...DEFAULT_SUBTITLE_STYLE } } : {}),
        items: [],
    };
}

export function normalizeTracks(timeline, { packVideo = false } = {}) {
    const raw = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
    const byType = {};
    const seen = new Set();

    raw.forEach((track) => {
        const type = TRACK_ORDER.includes(track.type) ? track.type : "video";
        const group = byType[type] || (byType[type] = []);
        const items = (track.items || []).map((item) => normalizeItem(item, type));

        // Timelines written before rows had ids get a deterministic one from
        // their position in the group, so reloading the same document twice
        // produces the same ids and autosave has nothing to churn on.
        let id = track.id ? String(track.id) : `${type}-${group.length}`;
        while (seen.has(id)) id = `${id}x`;
        seen.add(id);

        group.push({
            id,
            type,
            visible: track.visible !== false,
            muted: track.muted === true,
            locked: track.locked === true,
            captionStyle: type === "subtitle"
                ? normalizeSubtitleStyle(track.caption_style || track.captionStyle || items[0]?.style)
                : undefined,
            items: isPictureTrack(type) && packVideo ? packVideoClips(items) : sortItems(items),
        });
    });

    liftPicturePolish(byType);

    const noCues = !byType.subtitle?.some((track) => track.items.length);
    if (noCues && Array.isArray(timeline?.subtitles) && timeline.subtitles.length) {
        const cues = sortItems(timeline.subtitles.map((s) => normalizeItem(s, "subtitle")));
        if (byType.subtitle?.length) byType.subtitle[0].items = cues;
        else byType.subtitle = [{ ...emptyTrack("subtitle", "subtitle-0"), items: cues }];
    }

    // Required types keep at least one row so the lane is always there to drop on.
    // Stills are opt-in via + Track and can be removed when empty.
    REQUIRED_TRACK_TYPES.forEach((type) => {
        if (!byType[type]?.length) byType[type] = [emptyTrack(type, `${type}-0`)];
    });

    return orderTracks(TRACK_ORDER.flatMap((type) => byType[type] || []));
}

function effectCoversStart(items, startMs) {
    return (items || []).some((item) => Math.abs(item.startMs - startMs) < 2);
}

/**
 * Timelines that stored punch-in / spotlight on the video clip become Zoom
 * and Spotlight lanes, then those fields are stripped so they cannot round-trip.
 */
function liftPicturePolish(byType) {
    const zoomExtra = [];
    const spotExtra = [];
    const existingZoom = byType.zoom?.[0]?.items || [];
    const existingSpot = byType.spotlight?.[0]?.items || [];

    ["video", "still"].forEach((type) => {
        (byType[type] || []).forEach((track) => {
            track.items = track.items.map((item) => {
                let next = item;
                if (item.transform && !item.spotlight) {
                    const rect = rectFromTransform(item.transform);
                    if (rect && !effectCoversStart(existingZoom, item.startMs)
                        && !effectCoversStart(zoomExtra, item.startMs)) {
                        zoomExtra.push(normalizeItem({
                            in: item.startMs,
                            out: clipEnd(item),
                            rect,
                            label: "Zoom",
                        }, "zoom"));
                    }
                    next = { ...next };
                    delete next.transform;
                } else if (item.transform) {
                    next = { ...next };
                    delete next.transform;
                }
                if (item.spotlight) {
                    const rect = normalizeEffectRect(item.spotlight);
                    if (rect && !effectCoversStart(existingSpot, item.startMs)
                        && !effectCoversStart(spotExtra, item.startMs)) {
                        spotExtra.push(normalizeItem({
                            in: item.startMs,
                            out: clipEnd(item),
                            rect,
                            label: "Spotlight",
                        }, "spotlight"));
                    }
                    next = { ...next };
                    delete next.spotlight;
                }
                return next;
            });
        });
    });

    if (zoomExtra.length) {
        if (!byType.zoom?.length) byType.zoom = [emptyTrack("zoom", "zoom-0")];
        byType.zoom[0] = {
            ...byType.zoom[0],
            items: sortItems([...byType.zoom[0].items, ...zoomExtra]),
        };
    }
    if (spotExtra.length) {
        if (!byType.spotlight?.length) byType.spotlight = [emptyTrack("spotlight", "spotlight-0")];
        byType.spotlight[0] = {
            ...byType.spotlight[0],
            items: sortItems([...byType.spotlight[0].items, ...spotExtra]),
        };
    }
}

/** Put rows back into canonical grouping after an insert or a cross-row move. */
export function orderTracks(tracks) {
    const head = BOARD_HEAD.flatMap((type) => tracksOfType(tracks, type));
    const tail = BOARD_TAIL.flatMap((type) => tracksOfType(tracks, type));
    return [...head, ...stackPictureTracks(tracks), ...tail];
}

export function totalFromTracks(tracks) {
    let max = 0;
    tracks.forEach((track) => {
        track.items.forEach((item) => {
            max = Math.max(max, clipEnd(item));
        });
    });
    return Math.max(max, 1000);
}

export function serializeTracks(tracks) {
    return orderTracks(tracks).map((track) => ({
        id: track.id,
        type: track.type,
        visible: track.visible !== false,
        muted: track.muted === true,
        locked: track.locked === true,
        ...(track.type === "subtitle" && track.captionStyle
            ? { caption_style: normalizeSubtitleStyle(track.captionStyle) }
            : {}),
        items: sortItems(track.items).map((item) => {
            if (track.type === "subtitle") {
                return {
                    text: item.text || item.label || "",
                    in: Math.round(item.startMs),
                    out: Math.round(clipEnd(item)),
                    style: item.style || track.captionStyle || undefined,
                };
            }
            if (isEffectTrack(track.type)) {
                return {
                    in: Math.round(item.startMs),
                    out: Math.round(clipEnd(item)),
                    label: item.label,
                    rect: (track.type === "zoom"
                        ? normalizeZoomRect(item.rect)
                        : normalizeEffectRect(item.rect)) || undefined,
                    ...(track.type === "zoom"
                        ? { transition_ms: zoomTransitionMs(item) }
                        : {}),
                };
            }
            const trimIn = Math.round(item.trimIn || 0);
            const speed = clipSpeed(item.speed);
            const sourceOut = Math.round(sourceOutMs(item));
            const base = {
                position: Math.round(item.startMs),
                in: trimIn,
                out: sourceOut,
                label: item.label,
                source_duration_ms: item.sourceDurationMs != null
                    ? Math.round(item.sourceDurationMs)
                    : undefined,
                speed: speed !== 1 ? speed : undefined,
            };
            if (isPictureTrack(track.type)) {
                const transitionOut = normalizeTransitionOut(item.transitionOut);
                const pip = normalizePip(item.pip);
                return {
                    ...base,
                    scene_id: item.scene_id,
                    frame_id: item.frame_id,
                    asset_id: item.asset_id,
                    usage_id: item.usage_id,
                    video_url: item.video_url,
                    keyframe_url: item.keyframe_url,
                    // Omitted rather than false so an untouched timeline
                    // serializes byte-identically to how it was loaded.
                    audio_detached: item.audioDetached === true ? true : undefined,
                    audio_owner: item.audio_owner || undefined,
                    transition_out: transitionOut || undefined,
                    pip: pipExplicitlyDisabled(item.pip)
                        ? { enabled: false }
                        : (pip || undefined),
                    split: splitExplicitlyDisabled(item.split)
                        ? { enabled: false }
                        : (normalizeSplit(item.split) || undefined),
                    item_key: item.item_key || undefined,
                    visual_role: item.visual_role || undefined,
                    asset_class: item.asset_class || undefined,
                    subject_id: item.subject_id || undefined,
                    presentation_mode: item.presentation_mode || undefined,
                    narrative_purpose: item.narrative_purpose || undefined,
                    information_added: item.information_added || undefined,
                    base_item_key: item.base_item_key || undefined,
                    exclusive_group: item.exclusive_group || undefined,
                    generation_status: item.generation_status || undefined,
                    placeholder: item.placeholder === true ? true : undefined,
                    required: item.required === false ? false : undefined,
                    source_crop: clipSourceCrop(item.source_crop) || undefined,
                };
            }
            if (track.type === "audio") {
                return {
                    ...base,
                    voiceover_id: item.voiceover_id,
                    asset_id: item.asset_id,
                    usage_id: item.usage_id,
                    audio_url: item.audio_url,
                    volume: item.volume,
                    item_key: item.item_key || undefined,
                    lifted_from: item.liftedFrom || undefined,
                    role: item.role || undefined,
                    scene_id: item.scene_id || undefined,
                    frame_id: item.frame_id || undefined,
                };
            }
            return {
                ...base,
                asset_id: item.asset_id,
                usage_id: item.usage_id,
                audio_url: item.audio_url,
                volume: item.volume,
                label: item.label || "Background bed",
            };
        }),
    }));
}

export function subtitlesFromTracks(tracks) {
    const cues = tracksOfType(tracks, "subtitle").flatMap((track) => track.items);
    return sortItems(cues).map((item) => ({
        text: item.text || item.label || "",
        in: Math.round(item.startMs),
        out: Math.round(clipEnd(item)),
        style: item.style || undefined,
    }));
}

export function deepClone(tracks) {
    return tracks.map((track) => ({ ...track, items: track.items.map((item) => ({ ...item })) }));
}

export function findClip(tracks, id) {
    for (const track of tracks) {
        const item = track.items.find((it) => it._id === id);
        if (item) return { track, item };
    }
    return null;
}

export function allClips(tracks) {
    return tracks.flatMap((track) => track.items.map((item) => ({ track, item })));
}

/**
 * Clip ids on unlocked tracks relative to a timeline position.
 * `right` = start at or after `fromMs`; `left` = start before `fromMs`.
 * Pass `trackIds` to limit to those rows (e.g. the row of the current selection).
 *
 * @param {object[]} tracks
 * @param {number} fromMs
 * @param {{ direction?: "left"|"right", trackIds?: Iterable<string>|null }} [opts]
 */
export function clipIdsFromMs(tracks, fromMs, { direction = "right", trackIds = null } = {}) {
    const at = Math.max(0, Math.round(Number(fromMs) || 0));
    const scope = trackIds == null ? null : new Set(trackIds);
    const ids = new Set();
    (tracks || []).forEach((track) => {
        if (track.locked) return;
        if (scope && !scope.has(track.id)) return;
        (track.items || []).forEach((item) => {
            if (direction === "left") {
                if (item.startMs < at) ids.add(item._id);
            } else if (item.startMs >= at) {
                ids.add(item._id);
            }
        });
    });
    return ids;
}

/**
 * Snap candidates: track boundaries, the playhead, zero and the timeline end.
 * Clips being dragged are excluded so a clip never snaps to itself.
 */
export function snapPointsFor(tracks, excludeIds = new Set(), extra = []) {
    const points = [0, ...extra];
    tracks.forEach((track) => {
        track.items.forEach((item) => {
            if (excludeIds.has(item._id)) return;
            points.push(item.startMs, clipEnd(item));
        });
    });
    return points;
}

/** Nearest snap point within threshold, or null. */
export function nearestSnap(ms, points, thresholdMs) {
    let best = null;
    let bestDist = thresholdMs;
    points.forEach((point) => {
        const dist = Math.abs(ms - point);
        if (dist <= bestDist) {
            bestDist = dist;
            best = point;
        }
    });
    return best;
}

/**
 * Move a set of clips by ONE shared delta so the selection keeps its shape.
 * (The old implementation snapped each clip independently, which collapsed the
 * spacing of a multi-clip drag.)
 *
 * @param origins  { [clipId]: originalStartMs }
 * @returns { tracks, guideMs }
 */
export function moveClips(tracks, origins, rawDeltaMs, { snapPoints = [], snapThresholdMs = 0 } = {}) {
    const ids = new Set(Object.keys(origins));
    if (!ids.size) return { tracks, guideMs: null };

    let delta = rawDeltaMs;

    // Never push the earliest clip past zero.
    const minOrigin = Math.min(...Object.values(origins));
    delta = Math.max(delta, -minOrigin);

    // One snap adjustment for the whole group: whichever moving edge lands
    // closest to a snap point wins.
    let guideMs = null;
    if (snapThresholdMs > 0 && snapPoints.length) {
        let bestAdjust = null;
        let bestDist = snapThresholdMs;
        allClips(tracks).forEach(({ item }) => {
            if (!ids.has(item._id)) return;
            const start = origins[item._id] + delta;
            [start, start + item.durationMs].forEach((edge) => {
                const target = nearestSnap(edge, snapPoints, snapThresholdMs);
                if (target == null) return;
                const dist = Math.abs(edge - target);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestAdjust = target - edge;
                    guideMs = target;
                }
            });
        });
        if (bestAdjust != null && minOrigin + delta + bestAdjust >= 0) {
            delta += bestAdjust;
        } else {
            guideMs = null;
        }
    }

    const next = tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => (
            ids.has(item._id)
                ? { ...item, startMs: Math.max(0, Math.round(origins[item._id] + delta)) }
                : item
        )),
    }));

    return { tracks: next, guideMs };
}

/** True when nothing already on the row occupies any of these spans. */
export function spansFit(track, spans, ignoreIds = new Set()) {
    return !track.items.some((item) => {
        if (ignoreIds.has(item._id)) return false;
        return spans.some((span) => (
            span.startMs < clipEnd(item) - 1 && item.startMs < span.startMs + span.durationMs - 1
        ));
    });
}

/**
 * Where a dragged set of clips can actually land.
 *
 * A clip only ever goes on a row of its own type, so hovering the voice lane
 * with a video clip resolves back to a video row rather than doing nothing.
 * The row under the cursor is tried first, then the other rows of that type in
 * order of how far they are from it, and if every one is busy at that moment a
 * new row is the answer — which is what stops a drop from silently burying one
 * clip under another.
 *
 * @returns {{ trackId: string|null, isNew: boolean, type: string }}
 */
export function resolveDrop(tracks, { type, spans, targetTrackId = null, ignoreIds = new Set() }) {
    const group = tracksOfType(tracks, type).filter((track) => !track.locked);
    if (!group.length) return { trackId: null, isNew: true, type };

    const hovered = group.findIndex((track) => track.id === targetTrackId);
    const order = [...group].sort((a, b) => {
        if (hovered < 0) return 0;
        return Math.abs(group.indexOf(a) - hovered) - Math.abs(group.indexOf(b) - hovered);
    });

    const fit = order.find((track) => spansFit(track, spans, ignoreIds));

    return fit
        ? { trackId: fit.id, isNew: false, type }
        : { trackId: null, isNew: true, type };
}

/**
 * Put clips on another row, creating it when the drop resolved to a new one.
 * The clips keep the times they already have; only their row changes.
 */
export function moveClipsToTrack(tracks, ids, drop) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (!idSet.size) return tracks;

    let next = tracks;
    let trackId = drop.trackId;

    if (drop.isNew || !findTrack(next, trackId)) {
        trackId = trackUid(drop.type);
        next = addTrack(next, drop.type, { id: trackId });
    }

    const moving = [];
    next = next.map((track) => {
        if (!track.items.some((item) => idSet.has(item._id))) return track;
        const keep = [];
        track.items.forEach((item) => (idSet.has(item._id) ? moving.push(item) : keep.push(item)));
        return { ...track, items: keep };
    });

    if (!moving.length) return tracks;

    return next.map((track) => (
        track.id === trackId
            ? { ...track, items: sortItems([...track.items, ...moving]) }
            : track
    ));
}

/**
 * Drop a new clip onto a row, preferring the playhead.
 *
 * The playhead is usually mid-clip, so an insert that insisted on it would
 * land on top of something. It slides forward to the first free slot on the row
 * instead, which is the same "never bury a clip" rule a drop follows.
 */
export function insertClip(tracks, trackId, draft, atMs = 0) {
    const track = findTrack(tracks, trackId);
    if (!track) return tracks;

    const item = normalizeItem(
        isCueTrack(track.type)
            ? {
                ...draft,
                in: Math.round(atMs),
                out: Math.round(atMs) + (draft.durationMs || (isEffectTrack(track.type) ? DEFAULT_EFFECT_MS : 2000)),
                rect: draft.rect,
            }
            : { ...draft, position: Math.round(atMs), in: 0, out: draft.durationMs || 3000 },
        track.type
    );

    let cursor = Math.max(0, Math.round(atMs));
    sortItems(track.items).forEach((existing) => {
        if (existing.startMs < cursor + item.durationMs - 1 && cursor < clipEnd(existing) - 1) {
            cursor = clipEnd(existing);
        }
    });

    return tracks.map((t) => (
        t.id === trackId
            ? { ...t, items: sortItems([...t.items, { ...item, startMs: cursor }]) }
            : t
    ));
}

/**
 * Lift the sound out of a video clip onto an audio row.
 *
 * The renderer never muxes a video clip's own audio — every segment is encoded
 * with -an — so a scene's sound only reaches the export once it exists as an
 * audio clip. Because ffmpeg reads an audio stream out of an .mp4 as happily as
 * out of an .mp3, the lifted clip just points `audio_url` at the same file over
 * the same span. Nothing is re-encoded and nothing is uploaded.
 *
 * The new clips land together via the normal collision rules, so they take a
 * free audio row when there is one and a fresh row when the voiceover is
 * already sitting where they need to be.
 */
export function detachAudio(tracks, ids) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    const lifted = [];

    const marked = tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        let touched = false;
        const items = track.items.map((item) => {
            if (!idSet.has(item._id) || !item.video_url || item.audioDetached) return item;
            touched = true;
            lifted.push(normalizeItem({
                position: item.startMs,
                in: item.trimIn || 0,
                out: (item.trimIn || 0) + item.durationMs,
                label: `${item.label || "Clip"} audio`,
                audio_url: item.video_url,
                source_duration_ms: item.sourceDurationMs ?? undefined,
            }, "audio"));
            return { ...item, audioDetached: true };
        });
        return touched ? { ...track, items } : track;
    });

    if (!lifted.length) return tracks;

    const drop = resolveDrop(marked, {
        type: "audio",
        spans: lifted.map((item) => ({ startMs: item.startMs, durationMs: item.durationMs })),
    });

    let next = marked;
    let trackId = drop.trackId;
    if (drop.isNew || !findTrack(next, trackId)) {
        trackId = trackUid("audio");
        next = addTrack(next, "audio", { id: trackId });
    }

    return next.map((track) => (
        track.id === trackId
            ? { ...track, items: sortItems([...track.items, ...lifted]) }
            : track
    ));
}

/**
 * Put a detached clip's sound back where it came from.
 *
 * The lifted clip is matched by source and start rather than by id, because
 * ids are minted fresh on every load and would not survive a reload.
 */
export function reattachAudio(tracks, ids) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    const sources = [];

    const cleared = tracks.map((track) => {
        if (!isPictureTrack(track.type)) return track;
        let touched = false;
        const items = track.items.map((item) => {
            if (!idSet.has(item._id) || !item.audioDetached) return item;
            touched = true;
            if (item.video_url) sources.push({ url: item.video_url, startMs: item.startMs });
            return { ...item, audioDetached: false };
        });
        return touched ? { ...track, items } : track;
    });

    if (!sources.length) return cleared;

    return cleared.map((track) => {
        if (track.type !== "audio") return track;
        const items = track.items.filter((item) => !sources.some(
            (source) => item.audio_url === source.url && Math.abs(item.startMs - source.startMs) < 2
        ));
        return items.length === track.items.length ? track : { ...track, items };
    });
}

/** Selected video clips that still have sound to lift, and ones already lifted. */
export function detachableCounts(tracks, ids) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    let detachable = 0;
    let detached = 0;
    pictureTracks(tracks).forEach((track) => {
        track.items.forEach((item) => {
            if (!idSet.has(item._id) || !item.video_url) return;
            if (item.audioDetached) detached += 1;
            else detachable += 1;
        });
    });
    return { detachable, detached };
}

/** Arrow-key nudge: same as a move, without snapping. */
export function nudgeClips(tracks, ids, deltaMs) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (!idSet.size) return tracks;
    let clamped = deltaMs;
    allClips(tracks).forEach(({ item }) => {
        if (idSet.has(item._id)) clamped = Math.max(clamped, -item.startMs);
    });
    return tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => (
            idSet.has(item._id)
                ? { ...item, startMs: Math.max(0, Math.round(item.startMs + clamped)) }
                : item
        )),
    }));
}

/**
 * Drag a clip edge. Trims consume source media, so the new duration is clamped
 * to what the source actually has (when we know its length).
 *
 * @param edge    "start" | "end"
 * @param ripple  shift every later clip on the same track by the length change
 */
export function trimClip(tracks, id, edge, deltaMs, { ripple = false, snapPoints = [], snapThresholdMs = 0 } = {}) {
    const found = findClip(tracks, id);
    if (!found) return { tracks, guideMs: null };

    const { track, item } = found;
    const isCue = isCueTrack(track.type);
    const sourceMax = item.sourceDurationMs;
    const speed = clipSpeed(item.speed);
    let guideMs = null;

    let nextStart = item.startMs;
    let nextDuration = item.durationMs;
    let nextTrimIn = item.trimIn;

    if (edge === "end") {
        let target = clipEnd(item) + deltaMs;
        const snapped = snapThresholdMs > 0 ? nearestSnap(target, snapPoints, snapThresholdMs) : null;
        if (snapped != null) {
            target = snapped;
            guideMs = snapped;
        }
        nextDuration = target - item.startMs;
        const maxDuration = !isCue && sourceMax != null
            ? Math.max(MIN_CLIP_MS, Math.round((sourceMax - item.trimIn) / speed))
            : Infinity;
        nextDuration = Math.min(Math.max(MIN_CLIP_MS, nextDuration), maxDuration);
        if (guideMs != null && Math.round(item.startMs + nextDuration) !== Math.round(target)) {
            guideMs = null;
        }
    } else {
        let target = item.startMs + deltaMs;
        const snapped = snapThresholdMs > 0 ? nearestSnap(target, snapPoints, snapThresholdMs) : null;
        if (snapped != null) {
            target = snapped;
            guideMs = snapped;
        }
        target = Math.max(0, target);
        let shift = target - item.startMs;
        // Can't reveal media before the source's first frame.
        if (!isCue) shift = Math.max(shift, -(item.trimIn || 0) / speed);
        // Can't shrink past the minimum length.
        shift = Math.min(shift, item.durationMs - MIN_CLIP_MS);
        nextStart = item.startMs + shift;
        nextDuration = item.durationMs - shift;
        if (!isCue) nextTrimIn = item.trimIn + shift * speed;
        if (guideMs != null && Math.round(nextStart) !== Math.round(target)) guideMs = null;
    }

    nextStart = Math.max(0, Math.round(nextStart));
    nextDuration = Math.max(MIN_CLIP_MS, Math.round(nextDuration));
    nextTrimIn = Math.max(0, Math.round(nextTrimIn));
    const nextTrimOut = nextTrimIn + Math.round(nextDuration * speed);

    const lengthDelta = nextDuration - item.durationMs;
    const originalEnd = clipEnd(item);

    const next = tracks.map((t) => {
        if (t.id !== track.id) return t;
        return {
            ...t,
            items: t.items.map((it) => {
                if (it._id === id) {
                    return {
                        ...it,
                        startMs: nextStart,
                        durationMs: nextDuration,
                        trimIn: nextTrimIn,
                        trimOut: nextTrimOut,
                    };
                }
                if (ripple && edge === "end" && it.startMs >= originalEnd) {
                    return { ...it, startMs: Math.max(0, it.startMs + lengthDelta) };
                }
                return it;
            }),
        };
    });

    return { tracks: next, guideMs };
}

/**
 * Cut every targeted clip that straddles `ms` into two, splitting the source
 * trim at the same point so the second half plays the footage that follows.
 */
export function splitAt(tracks, ms, ids = null) {
    const idSet = ids ? (ids instanceof Set ? ids : new Set(ids)) : null;
    let didSplit = false;

    const next = tracks.map((track) => ({
        ...track,
        items: track.items.flatMap((item) => {
            if (idSet && !idSet.has(item._id)) return [item];
            const start = item.startMs;
            const end = clipEnd(item);
            if (ms <= start + MIN_CLIP_MS || ms >= end - MIN_CLIP_MS) return [item];

            didSplit = true;
            const leftDuration = Math.round(ms - start);
            const rightDuration = Math.round(end - ms);
            const speed = clipSpeed(item.speed);
            const cutPoint = Math.round((item.trimIn || 0) + leftDuration * speed);

            return [
                {
                    ...item,
                    durationMs: leftDuration,
                    trimOut: cutPoint,
                },
                {
                    ...item,
                    _id: uid(),
                    startMs: Math.round(ms),
                    durationMs: rightDuration,
                    trimIn: cutPoint,
                    trimOut: cutPoint + Math.round(rightDuration * speed),
                },
            ];
        }),
    }));

    return { tracks: next, didSplit };
}

/** Remove clips and leave the hole where they were. */
export function liftDelete(tracks, ids) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    return tracks.map((track) => ({
        ...track,
        items: track.items.filter((item) => !idSet.has(item._id)),
    }));
}

/** Remove clips and pull everything after them back on the same track. */
export function rippleDelete(tracks, ids) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    return tracks.map((track) => {
        if (!track.items.some((item) => idSet.has(item._id))) return track;
        let shift = 0;
        const items = [];
        sortItems(track.items).forEach((item) => {
            if (idSet.has(item._id)) {
                shift += item.durationMs;
                return;
            }
            items.push({ ...item, startMs: Math.max(0, item.startMs - shift) });
        });
        return { ...track, items };
    });
}

export function setSubtitleText(tracks, id, text) {
    return tracks.map((track) => {
        if (track.type !== "subtitle") return track;
        return {
            ...track,
            items: track.items.map((item) => (
                item._id === id ? { ...item, text, label: text.slice(0, 48) } : item
            )),
        };
    });
}

/** Caption look — shared by every cue so preview and export stay consistent. */
export const SUBTITLE_FONT_SIZES = [
    { id: "sm", label: "Small" },
    { id: "md", label: "Medium" },
    { id: "lg", label: "Large" },
    { id: "xl", label: "Extra large" },
];

/** Old preset ids → Google family names (timelines saved before the picker). */
const LEGACY_SUBTITLE_FONTS = {
    sans: "Inter",
    serif: "Merriweather",
    mono: "Roboto Mono",
    display: "Oswald",
};

export const DEFAULT_SUBTITLE_STYLE = {
    position: "bottom",
    font_size: "md",
    font_family: "Inter",
    animation: "word",
    color: "#FFFFFF",
    background: "rgba(0,0,0,0.55)",
};

export function resolveSubtitleFontFamily(raw) {
    const family = String(raw || "").trim();
    if (family === "") return DEFAULT_SUBTITLE_STYLE.font_family;
    return LEGACY_SUBTITLE_FONTS[family] || family;
}

export function normalizeSubtitleStyle(style = {}) {
    const raw = style && typeof style === "object" ? style : {};
    const sizeOk = SUBTITLE_FONT_SIZES.some((s) => s.id === raw.font_size);
    return {
        ...DEFAULT_SUBTITLE_STYLE,
        ...raw,
        font_size: sizeOk ? raw.font_size : DEFAULT_SUBTITLE_STYLE.font_size,
        font_family: resolveSubtitleFontFamily(raw.font_family),
    };
}

/** Style currently on the subtitle track (first cue), or defaults. */
export function subtitleStyleFromTracks(tracks) {
    const row = tracksOfType(tracks, "subtitle")[0];
    if (row?.captionStyle) return normalizeSubtitleStyle(row.captionStyle);
    const first = subtitleCues(tracks)[0]?.item?.style;
    return normalizeSubtitleStyle(first);
}

/** Merge a style patch onto every subtitle cue. */
export function setSubtitleStyle(tracks, patch = {}) {
    const next = normalizeSubtitleStyle({
        ...subtitleStyleFromTracks(tracks),
        ...patch,
    });
    return tracks.map((track) => {
        if (track.type !== "subtitle") return track;
        return {
            ...track,
            captionStyle: next,
            items: track.items.map((item) => ({
                ...item,
                style: { ...(item.style || {}), ...next },
            })),
        };
    });
}

/** Add a subtitle cue at the playhead, sized to fit the space available. */
export function addSubtitleCue(tracks, atMs, { text = "New subtitle", durationMs = 2000, trackId = null } = {}) {
    const target = trackId || tracksOfType(tracks, "subtitle")[0]?.id;
    const inherited = subtitleStyleFromTracks(tracks);
    return tracks.map((track) => {
        if (track.id !== target) return track;
        const start = Math.max(0, Math.round(atMs));
        const nextClip = sortItems(track.items).find((item) => item.startMs > start);
        const available = nextClip ? nextClip.startMs - start : durationMs;
        const duration = Math.max(MIN_CLIP_MS, Math.min(durationMs, available));
        const item = normalizeItem(
            { in: start, out: start + duration, text, style: inherited },
            "subtitle"
        );
        return { ...track, items: sortItems([...track.items, item]) };
    });
}

/** Every cue across every subtitle row, in reading order, with its row. */
export function subtitleCues(tracks) {
    return tracksOfType(tracks, "subtitle")
        .flatMap((track) => track.items.map((item) => ({ trackId: track.id, item })))
        .sort((a, b) => (
            a.item.startMs - b.item.startMs
            || String(a.item._id).localeCompare(String(b.item._id))
        ));
}

/** Drag a cue's in or out point from the list, where times are typed not dragged. */
export function setCueTime(tracks, id, { startMs, endMs }) {
    const found = findClip(tracks, id);
    if (!found || found.track.type !== "subtitle") return tracks;

    const start = Math.max(0, Math.round(startMs ?? found.item.startMs));
    const end = Math.round(endMs ?? clipEnd(found.item));
    const duration = Math.max(MIN_CLIP_MS, end - start);

    return tracks.map((track) => (
        track.id !== found.track.id ? track : {
            ...track,
            items: sortItems(track.items.map((item) => (
                item._id === id ? { ...item, startMs: start, durationMs: duration } : item
            ))),
        }
    ));
}

/**
 * Join two cues into one spanning both. Only within a row: cues on different
 * rows are stacked on purpose, and collapsing them would silently drop a layer.
 */
export function mergeCues(tracks, idA, idB) {
    const a = findClip(tracks, idA);
    const b = findClip(tracks, idB);
    if (!a || !b || a.track.id !== b.track.id || a.track.type !== "subtitle") return tracks;

    const [first, second] = a.item.startMs <= b.item.startMs ? [a.item, b.item] : [b.item, a.item];
    const start = first.startMs;
    const end = Math.max(clipEnd(first), clipEnd(second));
    const text = [first.text || first.label, second.text || second.label]
        .map((part) => (part || "").trim())
        .filter(Boolean)
        .join(" ");

    return tracks.map((track) => (
        track.id !== a.track.id ? track : {
            ...track,
            items: sortItems(
                track.items
                    .filter((item) => item._id !== second._id)
                    .map((item) => (
                        item._id === first._id
                            ? { ...item, startMs: start, durationMs: Math.max(MIN_CLIP_MS, end - start), text, label: text.slice(0, 48) }
                            : item
                    ))
            ),
        }
    ));
}

/**
 * Add a cue between two neighbours.
 *
 * Usually there is a gap to drop into. When the two abut — which is the norm
 * for cues cut from a voiceover — the new line borrows the tail of the one
 * before it, or the head of the one after when the first has nothing to spare.
 * Either way nothing else on the row moves.
 */
export function insertCueBetween(tracks, beforeId, afterId, { text = "", durationMs = 2000 } = {}) {
    const before = beforeId ? findClip(tracks, beforeId) : null;
    const after = afterId ? findClip(tracks, afterId) : null;
    const host = before?.track || after?.track;
    if (!host || host.type !== "subtitle") return tracks;
    if (before && after && before.track.id !== after.track.id) return tracks;

    const gapStart = before ? clipEnd(before.item) : 0;
    const gapEnd = after ? after.item.startMs : gapStart + durationMs;

    let start = gapStart;
    let end = Math.min(gapStart + durationMs, gapEnd);
    let shrink = null;

    if (end - start < MIN_CLIP_MS) {
        // No room between them, so one neighbour has to give some up.
        const donor = before && before.item.durationMs >= MIN_CLIP_MS * 2
            ? { id: before.item._id, from: "end" }
            : (after && after.item.durationMs >= MIN_CLIP_MS * 2
                ? { id: after.item._id, from: "start" }
                : null);
        if (!donor) return tracks;

        if (donor.from === "end") {
            start = clipEnd(before.item) - MIN_CLIP_MS;
            end = start + MIN_CLIP_MS;
            shrink = { id: donor.id, startMs: before.item.startMs, durationMs: before.item.durationMs - MIN_CLIP_MS };
        } else {
            start = after.item.startMs;
            end = start + MIN_CLIP_MS;
            shrink = { id: donor.id, startMs: end, durationMs: after.item.durationMs - MIN_CLIP_MS };
        }
    }

    const cue = normalizeItem({
        in: Math.round(start),
        out: Math.round(end),
        text,
        style: subtitleStyleFromTracks(tracks),
    }, "subtitle");

    return tracks.map((track) => {
        if (track.id !== host.id) return track;
        const items = track.items.map((item) => (
            shrink && item._id === shrink.id
                ? { ...item, startMs: shrink.startMs, durationMs: shrink.durationMs }
                : item
        ));
        return { ...track, items: sortItems([...items, cue]) };
    });
}

export function setTrackFlag(tracks, trackId, flag, value) {
    return tracks.map((track) => (
        track.id === trackId ? { ...track, [flag]: value } : track
    ));
}

/**
 * Add a row of a type at the TOP of its group, so a clip moved onto it wins
 * over whatever sits below rather than disappearing under it. Picture rows
 * (video / still) insert at the top of the picture stack — above the spine.
 */
export function addTrack(tracks, type, { id = trackUid(type) } = {}) {
    const row = emptyTrack(type, id);
    const next = [...tracks];
    if (isPictureTrack(type)) {
        const pictures = pictureTracks(tracks);
        const at = pictures.length
            ? tracks.indexOf(pictures[0])
            : (() => {
                const tail = tracks.find((track) => BOARD_TAIL.includes(track.type));
                return tail ? tracks.indexOf(tail) : tracks.length;
            })();
        next.splice(at, 0, row);
        return orderTracks(next);
    }
    const group = tracksOfType(tracks, type);
    const at = group.length ? tracks.indexOf(group[0]) : tracks.length;
    next.splice(at, 0, row);
    return orderTracks(next);
}

/** Drop an empty row. Required types always keep one lane; stills can go entirely. */
export function removeTrack(tracks, trackId) {
    const track = findTrack(tracks, trackId);
    if (!track || track.items.length) return tracks;
    if (REQUIRED_TRACK_TYPES.includes(track.type) && tracksOfType(tracks, track.type).length < 2) {
        return tracks;
    }
    return tracks.filter((t) => t.id !== trackId);
}

/**
 * Record the real length of a source once the player has loaded its metadata,
 * so trim handles know where the media actually ends.
 */
export function setSourceDuration(tracks, sourceUrl, durationMs) {
    if (!sourceUrl || !Number.isFinite(durationMs) || durationMs <= 0) return tracks;
    let changed = false;
    const next = tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => {
            const url = item.video_url || item.audio_url;
            if (url !== sourceUrl || item.sourceDurationMs != null) return item;
            changed = true;
            return { ...item, sourceDurationMs: Math.round(durationMs) };
        }),
    }));
    return changed ? next : tracks;
}

/** Gaps on one row — on the base video row the renderer fills these with black. */
export function findGaps(tracks, trackId) {
    const track = findTrack(tracks, trackId);
    if (!track) return [];
    const gaps = [];
    let cursor = 0;
    sortItems(track.items).forEach((item) => {
        if (item.startMs > cursor + 1) {
            gaps.push({ startMs: cursor, durationMs: item.startMs - cursor });
        }
        cursor = Math.max(cursor, clipEnd(item));
    });
    return gaps;
}

/** The clip visible at a given time, or null when the playhead sits in a gap. */
export function clipAt(items, ms) {
    for (const item of items) {
        if (ms >= item.startMs && ms < clipEnd(item)) return item;
    }
    return null;
}

/** Topmost visible effect clip of `type` covering `ms`. */
export function effectAt(tracks, type, ms) {
    for (const row of tracksOfType(tracks, type)) {
        if (row.visible === false) continue;
        const item = clipAt(row.items, ms);
        if (item) return { track: row, item };
    }
    return null;
}

/**
 * Punch-in + spotlight at a timeline instant. Effect lanes win; leftover
 * fields on the picture clip are the fallback for unsaved hydrations.
 */
export function livePicturePolish(tracks, pictureItem, ms) {
    const zoom = effectAt(tracks, "zoom", ms);
    const spot = effectAt(tracks, "spotlight", ms);
    const amount = zoom ? zoomAmountAt(zoom.item, ms) : 0;
    const target = zoom ? (normalizeZoomRect(zoom.item.rect) || DEFAULT_EFFECT_RECT) : null;
    const zoomRect = target ? lerpRect(FULL_FRAME_RECT, target, amount) : null;
    return {
        transform: zoomRect && amount > 0
            ? transformFromRect(zoomRect)
            : normalizeTransform(pictureItem?.transform),
        spotlight: spot
            ? normalizeEffectRect(spot.item.rect)
            : normalizeSpotlight(pictureItem?.spotlight),
        zoomRect,
        zoomAmount: amount,
    };
}

/** Drop a zoom or spotlight clip at the playhead. */
export function addEffectClip(tracks, type, atMs, {
    durationMs = null,
    rect = null,
    trackId = null,
    id = null,
} = {}) {
    if (!isEffectTrack(type)) return tracks;
    const target = trackId || tracksOfType(tracks, type)[0]?.id;
    if (!target) return tracks;
    const start = Math.max(0, Math.round(atMs));
    let duration = Math.round(Number(durationMs) || 0);
    if (duration < MIN_CLIP_MS) {
        let host = null;
        for (const row of pictureTracks(tracks)) {
            host = clipAt(row.items, start);
            if (host) break;
        }
        duration = host ? host.durationMs : DEFAULT_EFFECT_MS;
    }
    return insertClip(tracks, target, {
        _id: id || uid(),
        durationMs: Math.max(MIN_CLIP_MS, duration),
        rect: type === "zoom"
            ? (normalizeZoomRect(rect) || { ...DEFAULT_EFFECT_RECT })
            : (normalizeEffectRect(rect) || { ...DEFAULT_EFFECT_RECT }),
        label: TRACK_LABELS[type],
        ...(type === "zoom" ? { transitionMs: DEFAULT_ZOOM_TRANSITION_MS } : {}),
    }, start);
}
