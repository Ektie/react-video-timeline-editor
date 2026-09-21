import React from "react";
import { Input } from "./ui";

/** Lightweight wrappers kept for future NLE expansion */
export function TimelineTrack({ label, children }) {
    return (
        <div className="cs-timeline-track">
            <div className="cs-timeline-label">{label}</div>
            <div className="cs-timeline-lane">{children}</div>
        </div>
    );
}

export function TimelineClip({ children, className = "" }) {
    return <div className={`cs-clip ${className}`}>{children}</div>;
}

export function SubtitleClip({ text, onChange }) {
    return (
        <Input className="cs-subtitle-edit" value={text || ""} onChange={(e) => onChange?.(e.target.value)} />
    );
}
