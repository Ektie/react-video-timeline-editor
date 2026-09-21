export const DEFAULT_ASPECT = "9:16";

export const ASPECTS = {
    "9:16": { label: "Vertical", resolutions: ["1080x1920", "720x1280"] },
    "4:5": { label: "Portrait", resolutions: ["1080x1350", "864x1080"] },
    "1:1": { label: "Square", resolutions: ["1080x1080", "720x720"] },
    "16:9": { label: "Widescreen", resolutions: ["1920x1080", "1280x720"] },
};

export function aspectLabel(aspect) {
    return ASPECTS[aspect]?.label || aspect;
}

export function resolutionsFor(aspect) {
    return ASPECTS[aspect]?.resolutions || ASPECTS[DEFAULT_ASPECT].resolutions;
}

export function deliverySpec({ aspectRatio, resolution } = {}) {
    const aspect = ASPECTS[aspectRatio] ? aspectRatio : DEFAULT_ASPECT;
    const allowed = resolutionsFor(aspect);
    return {
        aspect_ratio: aspect,
        resolution: allowed.includes(resolution) ? resolution : allowed[0],
        format: "mp4",
    };
}
