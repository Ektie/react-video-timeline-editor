/**
 * Shared crop math for showcase upload edit + Cuts preview.
 *
 * Rects are { x, y, w, h } in 0–1 of the source, same contract as timeline zoom.
 */

export const MIN_CROP = 0.05;

export const CROP_ASPECTS = [
    { id: "free", label: "Free" },
    { id: "original", label: "Original" },
    { id: "16:9", label: "16:9", value: 16 / 9 },
    { id: "9:16", label: "9:16", value: 9 / 16 },
    { id: "1:1", label: "1:1", value: 1 },
];

function clamp01(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

export function isFullFrameCrop(rect) {
    if (!rect || typeof rect !== "object") return true;
    const w = Number(rect.w);
    const h = Number(rect.h);
    return w >= 0.999 && h >= 0.999;
}

/**
 * Clamp a crop into source space. Full-frame and tiny boxes become null
 * so callers can skip a no-op crop.
 */
export function normalizeSourceCrop(raw) {
    if (!raw || typeof raw !== "object") return null;
    let x = clamp01(raw.x);
    let y = clamp01(raw.y);
    let w = clamp01(raw.w);
    let h = clamp01(raw.h);
    if (!Number.isFinite(Number(raw.x)) || !Number.isFinite(Number(raw.y))) return null;
    if (!Number.isFinite(Number(raw.w)) || !Number.isFinite(Number(raw.h))) return null;
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    if (w < MIN_CROP || h < MIN_CROP) return null;
    if (w >= 0.999 && h >= 0.999) return null;
    return { x, y, w, h };
}

/** Starting box is full-frame so Apply without a drag is a no-op. */
export function defaultCropRect() {
    return { x: 0, y: 0, w: 1, h: 1 };
}

/**
 * Zoom is relative to the already-cropped window. Map it back to source space
 * so preview/export can apply one cropToRectCss / ffmpeg crop.
 */
export function composeSourceCrop(source, zoom) {
    const s = normalizeSourceCrop(source);
    const z = zoom && typeof zoom === "object" ? zoom : null;
    const zw = z ? Number(z.w) : 0;
    const zh = z ? Number(z.h) : 0;
    const zx = z ? Number(z.x) : 0;
    const zy = z ? Number(z.y) : 0;
    const zoomLive = z && zw > 0 && zh > 0 && Number.isFinite(zx) && Number.isFinite(zy)
        && !(zw >= 0.999 && zh >= 0.999);

    if (!s) {
        if (!zoomLive) return null;
        return { x: zx, y: zy, w: zw, h: zh };
    }
    if (!zoomLive) return s;
    return {
        x: s.x + zx * s.w,
        y: s.y + zy * s.h,
        w: zw * s.w,
        h: zh * s.h,
    };
}

export function aspectValue(id, mediaAR) {
    if (id === "original") {
        const n = Number(mediaAR);
        return n > 0 ? n : null;
    }
    const found = CROP_ASPECTS.find((a) => a.id === id);
    return found?.value || null;
}

/** Largest box of `aspect` (width/height) around the current center. */
export function fitRectToAspect(rect, aspect) {
    const r = rect && typeof rect === "object" ? rect : defaultCropRect();
    const target = Number(aspect);
    if (!(target > 0)) return r;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    let w = r.w;
    let h = w / target;
    if (h > r.h) {
        h = r.h;
        w = h * target;
    }
    if (w > 1) {
        w = 1;
        h = w / target;
    }
    if (h > 1) {
        h = 1;
        w = h * target;
    }
    w = Math.max(MIN_CROP, Math.min(1, w));
    h = Math.max(MIN_CROP, Math.min(1, h));
    let x = cx - w / 2;
    let y = cy - h / 2;
    x = Math.max(0, Math.min(1 - w, x));
    y = Math.max(0, Math.min(1 - h, y));
    return { x, y, w, h };
}

export function clampRect(rect, aspect = null) {
    let next = {
        x: Number(rect?.x) || 0,
        y: Number(rect?.y) || 0,
        w: Number(rect?.w) || MIN_CROP,
        h: Number(rect?.h) || MIN_CROP,
    };
    next.w = Math.max(MIN_CROP, next.w);
    next.h = Math.max(MIN_CROP, next.h);
    if (aspect > 0) {
        next = fitRectToAspect(next, aspect);
    }
    if (next.x < 0) {
        next.w = Math.max(MIN_CROP, next.w + next.x);
        next.x = 0;
    }
    if (next.y < 0) {
        next.h = Math.max(MIN_CROP, next.h + next.y);
        next.y = 0;
    }
    if (next.x + next.w > 1) next.w = Math.max(MIN_CROP, 1 - next.x);
    if (next.y + next.h > 1) next.h = Math.max(MIN_CROP, 1 - next.y);
    next.x = Math.max(0, Math.min(1 - next.w, next.x));
    next.y = Math.max(0, Math.min(1 - next.h, next.y));
    return next;
}

function mimeForCrop(file) {
    const type = String(file?.type || "");
    if (type === "image/png" || type === "image/webp" || type === "image/jpeg") return type;
    return "image/jpeg";
}

function extensionForMime(mime) {
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    return "jpg";
}

/**
 * Pixel-crop an image File. Browser-only (createImageBitmap + canvas).
 */
export async function cropImageToFile(file, rect) {
    const box = normalizeSourceCrop(rect) || clampRect(rect);
    const bitmap = await createImageBitmap(file);
    const sx = Math.max(0, Math.round(box.x * bitmap.width));
    const sy = Math.max(0, Math.round(box.y * bitmap.height));
    const sw = Math.max(1, Math.round(box.w * bitmap.width));
    const sh = Math.max(1, Math.round(box.h * bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(sw, bitmap.width - sx);
    canvas.height = Math.min(sh, bitmap.height - sy);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        throw new Error("Could not crop that photo");
    }
    ctx.drawImage(bitmap, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const mime = mimeForCrop(file);
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
            (out) => (out ? resolve(out) : reject(new Error("Could not crop that photo"))),
            mime,
            0.92,
        );
    });
    const base = String(file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.${extensionForMime(mime)}`, { type: mime });
}
