import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import { FilmstripCanvas, WaveformCanvas } from "./ClipCanvas";
import { clipEnd, playableVideoUrl } from "./TimelineClipModel";

/** Below this width a clip is a sliver — art would be noise. */
const ART_MIN_PX = 28;
const LANE_ART_HEIGHT = { video: 40, still: 40, audio: 28, music: 28, subtitle: 0, zoom: 0, spotlight: 0 };

function formatRange(item) {
    const toClock = (ms) => {
        const total = Math.max(0, Math.round(ms));
        return `${Math.floor(total / 60000)}:${String(Math.floor((total % 60000) / 1000)).padStart(2, "0")}`;
    };
    return `${toClock(item.startMs)} to ${toClock(clipEnd(item))}`;
}

function SubtitleEditor({ item, onDone }) {
    const inputRef = useRef(null);
    const [value, setValue] = useState(item.text || item.label || "");

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    return (
        <input
            ref={inputRef}
            className="cs-nle-clip-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onDone(value)}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onDone(value);
                if (e.key === "Escape") onDone(null);
            }}
            onPointerDown={(e) => e.stopPropagation()}
        />
    );
}

/**
 * One clip on a lane: media art sized to its own trim window, plus trim handles
 * on both edges so a clip's length is actually editable.
 */
export default function TimelineClip({
    item,
    track,
    zoom,
    offsetMs = 0,
    selected,
    editing,
    gestureHandlers,
    onPointerDown,
    onTrimStart,
    onTrimEnd,
    onContextMenu,
    onEdit,
    onEditDone,
}) {
    const width = Math.max(3, item.durationMs * zoom);
    const left = (item.startMs + offsetMs) * zoom;
    const artHeight = LANE_ART_HEIGHT[track.type] || 0;
    const showArt = width >= ART_MIN_PX && artHeight > 0;
    const isSubtitle = track.type === "subtitle";
    const label = item.label || item.text || track.type;

    return (
        // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
        <div
            className={`cs-nle-clip cs-nle-clip--${track.type} ${selected ? "is-selected" : ""} ${item.placeholder ? "is-placeholder" : ""}`}
            style={{ left, width }}
            role="option"
            aria-selected={selected}
            aria-label={`${label}, ${formatRange(item)}`}
            tabIndex={selected ? 0 : -1}
            title={`${label} · ${formatRange(item)}`}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
            onDoubleClick={isSubtitle ? onEdit : undefined}
            {...gestureHandlers}
        >
            {showArt && (track.type === "video" || track.type === "still") && (
                <FilmstripCanvas
                    src={playableVideoUrl(item.video_url)}
                    poster={item.keyframe_url || (!playableVideoUrl(item.video_url) ? item.video_url : null)}
                    width={width}
                    height={artHeight}
                    trimIn={item.trimIn}
                    durationMs={item.durationMs}
                    speed={item.speed}
                />
            )}

            {showArt && (track.type === "audio" || track.type === "music") && item.audio_url && (
                <WaveformCanvas
                    src={item.audio_url}
                    width={width}
                    height={artHeight}
                    trimIn={item.trimIn}
                    durationMs={item.durationMs}
                    color="currentColor"
                />
            )}

            <div className="cs-nle-clip-badges" aria-hidden>
                {item.audioDetached && (
                    <span className="cs-nle-clip-badge" title="This clip's audio lives on an audio row">
                        <Icon name="volume" size={11} />
                    </span>
                )}
                {Number(item.speed) > 1.05 && (
                    <span className="cs-nle-clip-badge is-speed" title={`${item.speed}× playback — this stretch is shortened on the board`}>
                        {Number.isInteger(Number(item.speed)) ? item.speed : Number(item.speed).toFixed(1)}×
                    </span>
                )}
            </div>

            {editing ? (
                <SubtitleEditor item={item} onDone={onEditDone} />
            ) : (
                <span className="cs-nle-clip-label">
                {label}
                {item.placeholder ? ` · ${item.generation_status || "planned"}` : ""}
            </span>
            )}

            {!track.locked && !editing && (
                <>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <span
                        className="cs-nle-handle is-start"
                        onPointerDown={onTrimStart}
                        {...gestureHandlers}
                    />
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <span
                        className="cs-nle-handle is-end"
                        onPointerDown={onTrimEnd}
                        {...gestureHandlers}
                    />
                </>
            )}
        </div>
    );
}
