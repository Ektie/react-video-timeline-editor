import React, { useEffect, useRef } from "react";
import { loadFrames, loadPeaks } from "./mediaPreview";

const DPR = () => Math.min(2, window.devicePixelRatio || 1);

function sizeCanvas(canvas, width, height) {
    const ratio = DPR();
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
        canvas.width = w * ratio;
        canvas.height = h * ratio;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, width: w, height: h };
}

/**
 * The waveform of the clip's own trim window, drawn from decoded audio.
 * Falls back to a flat line when the browser can't decode the file — a flat
 * line is honest, a fake waveform is not.
 */
export function WaveformCanvas({ src, width, height, trimIn = 0, durationMs = 0, color }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const draw = (data) => {
            if (cancelled || !canvasRef.current) return;
            const { ctx, width: w, height: h } = sizeCanvas(canvasRef.current, width, height);
            ctx.fillStyle = color;
            const mid = h / 2;

            if (!data?.peaks?.length) {
                ctx.globalAlpha = 0.35;
                ctx.fillRect(0, mid - 0.5, w, 1);
                return;
            }

            const { peaks, durationMs: sourceMs } = data;
            const total = sourceMs || durationMs || 1;
            const from = Math.max(0, Math.min(1, trimIn / total));
            const to = Math.max(from, Math.min(1, (trimIn + durationMs) / total));
            const first = Math.floor(from * peaks.length);
            const span = Math.max(1, Math.floor((to - from) * peaks.length));

            const barWidth = 2;
            const gap = 1;
            const bars = Math.max(1, Math.floor(w / (barWidth + gap)));
            ctx.globalAlpha = 0.75;
            for (let i = 0; i < bars; i++) {
                const peak = peaks[Math.min(peaks.length - 1, first + Math.floor((i / bars) * span))] || 0;
                const barHeight = Math.max(1, peak * (h - 4));
                ctx.fillRect(i * (barWidth + gap), mid - barHeight / 2, barWidth, barHeight);
            }
        };

        draw(null);
        loadPeaks(src).then(draw);

        return () => { cancelled = true; };
    }, [src, width, height, trimIn, durationMs, color]);

    return <canvas ref={canvasRef} className="cs-nle-clip-canvas" style={{ width, height }} aria-hidden />;
}

/** Cover-fit one frame into a cell, cropping the overflow instead of squashing. */
function drawCover(ctx, image, x, y, cellW, cellH) {
    const sw = image.width || image.videoWidth || cellW;
    const sh = image.height || image.videoHeight || cellH;
    if (!sw || !sh) return;
    const scale = Math.max(cellW / sw, cellH / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(image, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
}

/**
 * A strip of frames sampled from the clip's own trim window, so a video clip on
 * the track looks like its footage.
 *
 * The cell width comes from the frame's own aspect. It used to be hard-coded to
 * 16/9, which drew portrait footage into a landscape box — the stretch you see
 * on every clip. A lone poster is drawn once rather than repeated into every
 * cell, so a single still never poses as a strip.
 */
export function FilmstripCanvas({ src, poster, width, height, trimIn = 0, durationMs = 0, speed = 1 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        let hasStrip = false;
        if (!canvasRef.current) return undefined;

        const paint = (images, { tile }) => {
            if (cancelled || !canvasRef.current || !images?.length) return;
            // A poster that decodes after the frames must not overwrite them.
            if (!tile && hasStrip) return;
            hasStrip = hasStrip || tile;
            const { ctx, width: w, height: h } = sizeCanvas(canvasRef.current, width, height);

            const first = images[0];
            const aspect = (first.width || first.videoWidth || 16) / (first.height || first.videoHeight || 9);
            const cellWidth = Math.max(8, h * aspect);

            if (!tile) {
                // One frame is all we have: show it once, left-aligned, and let
                // the rest of the clip stay empty rather than fake a filmstrip.
                drawCover(ctx, first, 0, 0, Math.min(cellWidth, w), h);
                return;
            }

            const count = Math.max(1, Math.ceil(w / cellWidth));
            for (let i = 0; i < count; i++) {
                const image = images[Math.min(images.length - 1, Math.floor((i / count) * images.length))];
                if (image) drawCover(ctx, image, i * cellWidth, 0, cellWidth, h);
            }
        };

        // Show the keyframe immediately, upgrade to real frames when they land.
        if (poster) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => paint([img], { tile: false });
            img.src = poster;
        }

        if (src) {
            const rate = Math.max(0.5, Number(speed) || 1);
            const trimWindow = { fromMs: trimIn, toMs: durationMs > 0 ? trimIn + durationMs * rate : null };
            loadFrames(src, 8, trimWindow).then((result) => {
                if (result?.frames?.length) paint(result.frames, { tile: true });
            });
        }

        return () => { cancelled = true; };
    }, [src, poster, width, height, trimIn, durationMs, speed]);

    return <canvas ref={canvasRef} className="cs-nle-clip-canvas" style={{ width, height }} aria-hidden />;
}
