/**
 * Viewport-fixed placement used by CustomDropdown (and the timeline context menu).
 *
 * Tries the eight anchor-relative corners, picks the one with the least overflow,
 * then clamps into the viewport. Callers still portal the node to document.body —
 * this only returns coordinates.
 */
export function placeFixedOverlay({
    anchor,
    width,
    height,
    margin = 8,
    viewport,
}) {
    const vp = viewport || { width: window.innerWidth, height: window.innerHeight };
    const triggerRect = {
        top: anchor.top,
        left: anchor.left,
        bottom: anchor.bottom ?? anchor.top + (anchor.height || 0),
        right: anchor.right ?? anchor.left + (anchor.width || 0),
    };

    const placements = [
        { top: triggerRect.bottom, left: triggerRect.left },
        { top: triggerRect.bottom, left: triggerRect.right - width },
        { top: triggerRect.top - height, left: triggerRect.left },
        { top: triggerRect.top - height, left: triggerRect.right - width },
        { top: triggerRect.top, left: triggerRect.right },
        { top: triggerRect.bottom - height, left: triggerRect.right },
        { top: triggerRect.top, left: triggerRect.left - width },
        { top: triggerRect.bottom - height, left: triggerRect.left - width },
    ];

    const scored = placements.map((rect) => {
        const box = {
            top: rect.top,
            bottom: rect.top + height,
            left: rect.left,
            right: rect.left + width,
        };
        const overflow =
            Math.max(0, margin - box.top) +
            Math.max(0, box.bottom - (vp.height - margin)) +
            Math.max(0, margin - box.left) +
            Math.max(0, box.right - (vp.width - margin));
        return { box, overflow };
    });

    const best = scored.reduce((winner, current) =>
        current.overflow < winner.overflow ? current : winner
    );

    let top = best.box.top;
    let left = best.box.left;

    if (top + height > vp.height - margin) top = vp.height - height - margin;
    if (top < margin) top = margin;
    if (left + width > vp.width - margin) left = vp.width - width - margin;
    if (left < margin) left = margin;

    const maxHeight = Math.max(0, vp.height - margin * 2);
    const maxWidth = Math.max(0, vp.width - margin * 2);

    return {
        top,
        left,
        maxHeight,
        maxWidth,
        isAbove: top < triggerRect.top,
        isEnd: left !== triggerRect.left,
    };
}
