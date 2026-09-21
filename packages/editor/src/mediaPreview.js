/**
 * Real media previews for timeline clips.
 *
 * The clips used to show a hard-coded sawtooth for every waveform and one
 * keyframe tiled with repeat-x for every filmstrip, so nothing on the track
 * told you anything about the media. These helpers decode the actual audio and
 * grab actual frames, cached per source URL and rate-limited so a timeline with
 * a dozen clips doesn't saturate the network.
 */

const peakCache = new Map();
const frameCache = new Map();

const MAX_CONCURRENT = 2;
let running = 0;
const queue = [];

function schedule(task) {
    return new Promise((resolve) => {
        const run = () => {
            running += 1;
            task()
                .catch(() => null)
                .then((value) => {
                    running -= 1;
                    resolve(value);
                    const next = queue.shift();
                    if (next) next();
                });
        };
        if (running < MAX_CONCURRENT) run();
        else queue.push(run);
    });
}

/**
 * Normalised 0..1 peaks for an audio file. Resolves null when the browser
 * can't decode it, so callers can fall back rather than draw something fake.
 */
export function loadPeaks(url, buckets = 240) {
    if (!url) return Promise.resolve(null);
    const key = `${url}#${buckets}`;
    if (peakCache.has(key)) return peakCache.get(key);

    const promise = schedule(async () => {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) return null;
        const bytes = await response.arrayBuffer();
        const ctx = new Ctx();
        try {
            const audio = await ctx.decodeAudioData(bytes);
            const channel = audio.getChannelData(0);
            const step = Math.max(1, Math.floor(channel.length / buckets));
            const peaks = new Float32Array(buckets);
            let max = 0;
            for (let i = 0; i < buckets; i++) {
                let peak = 0;
                const start = i * step;
                const end = Math.min(channel.length, start + step);
                for (let j = start; j < end; j++) {
                    const value = Math.abs(channel[j]);
                    if (value > peak) peak = value;
                }
                peaks[i] = peak;
                if (peak > max) max = peak;
            }
            if (max > 0) {
                for (let i = 0; i < buckets; i++) peaks[i] /= max;
            }
            return { peaks, durationMs: Math.round(audio.duration * 1000) };
        } finally {
            ctx.close?.();
        }
    });

    peakCache.set(key, promise);
    return promise;
}

/**
 * Evenly spaced frames from a video, as ImageBitmaps. Cross-origin sources
 * taint the canvas we draw them onto, which is fine — we only ever display it.
 *
 * `fromMs`/`toMs` bound the sample window to the clip's own trim, so the two
 * halves of a split show their own footage instead of both replaying the
 * whole source. They are part of the cache key for the same reason.
 */
export function loadFrames(url, count = 8, { fromMs = 0, toMs = null } = {}) {
    if (!url) return Promise.resolve(null);
    const key = `${url}#${count}#${Math.round(fromMs)}#${toMs == null ? "end" : Math.round(toMs)}`;
    if (frameCache.has(key)) return frameCache.get(key);

    const promise = schedule(() => new Promise((resolve) => {
        const video = document.createElement("video");
        video.muted = true;
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.src = url;

        const frames = [];
        let index = 0;
        let settled = false;

        const finish = (value) => {
            if (settled) return;
            settled = true;
            video.removeAttribute("src");
            video.load?.();
            resolve(value);
        };

        const done = () => finish(
            frames.length
                ? { frames, durationMs: Math.round((video.duration || 0) * 1000) }
                : null
        );

        const grab = async () => {
            try {
                frames.push(await createImageBitmap(video));
            } catch (_) {
                done();
                return;
            }
            index += 1;
            if (index >= count) {
                done();
                return;
            }
            seekTo(index);
        };

        const seekTo = (i) => {
            const duration = video.duration;
            if (!Number.isFinite(duration) || duration <= 0) {
                finish(null);
                return;
            }
            const start = Math.max(0, Math.min(duration, fromMs / 1000));
            const end = toMs == null
                ? duration
                : Math.max(start, Math.min(duration, toMs / 1000));
            const span = end - start;
            // Sample cell centres so the first frame isn't the cut itself.
            const at = span > 0 ? start + (span * (i + 0.5)) / count : start;
            video.currentTime = Math.min(duration - 0.05, at);
        };

        video.addEventListener("loadeddata", () => seekTo(0), { once: true });
        video.addEventListener("seeked", grab);
        video.addEventListener("error", () => finish(null), { once: true });
        setTimeout(() => finish(frames.length ? { frames, durationMs: 0 } : null), 15000);
    }));

    frameCache.set(key, promise);
    return promise;
}
