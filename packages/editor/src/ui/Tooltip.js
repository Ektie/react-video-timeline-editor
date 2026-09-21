import React from "react";

export default function Tooltip({ text, children }) {
    if (!text) return children ?? null;
    return (
        <span className="vte-tooltip" data-tooltip={text}>
            {children}
        </span>
    );
}
