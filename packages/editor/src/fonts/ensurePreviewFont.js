const loadedFamilies = new Set();
const pendingFamilies = new Set();
let flushTimer = null;

/** Inject Google Fonts CSS for one or more families (batched). */
export function ensurePreviewFont(family) {
    if (typeof document === "undefined") return;
    const name = String(family || "").trim();
    if (!name || loadedFamilies.has(name)) return;
    if (document.getElementById(`gf-preview-${name.replace(/\s+/g, "-")}`)) {
        loadedFamilies.add(name);
        return;
    }

    pendingFamilies.add(name);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushPreviewFonts, 40);
}

function flushPreviewFonts() {
    const batch = [];
    for (const family of pendingFamilies) {
        if (loadedFamilies.has(family)) continue;
        batch.push(family);
        if (batch.length >= 20) break;
    }
    batch.forEach((family) => {
        pendingFamilies.delete(family);
        loadedFamilies.add(family);
    });
    if (pendingFamilies.size > 0) {
        flushTimer = setTimeout(flushPreviewFonts, 40);
    }
    if (batch.length === 0) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${
        batch.map((family) => `family=${encodeURIComponent(family)}:wght@400;600`).join("&")
    }&display=swap`;
    link.id = `gf-preview-${batch[0].replace(/\s+/g, "-")}`;
    document.head.appendChild(link);
}
