import React from "react";
import { ensurePreviewFont } from "./ensurePreviewFont";

export const DEFAULT_FONTS = [
    "Inter",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Playfair Display",
    "Source Sans 3",
    "Lora",
    "Oswald",
    "Raleway",
    "Noto Sans",
];

export default function FontSelect({
    fonts = DEFAULT_FONTS,
    loading = false,
    value,
    placeholder = "Font",
    onChange,
    className = "",
}) {
    const list = fonts.length ? fonts : DEFAULT_FONTS;
    return (
        <select
            className={`vte-input ${className}`.trim()}
            value={value || ""}
            disabled={loading}
            aria-label={placeholder}
            onChange={(event) => {
                const family = event.target.value;
                ensurePreviewFont(family);
                onChange?.(family);
            }}
        >
            {!value && <option value="">{placeholder}</option>}
            {list.map((family) => (
                <option key={family} value={family} style={{ fontFamily: family }}>{family}</option>
            ))}
        </select>
    );
}
