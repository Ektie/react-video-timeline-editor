import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, Tooltip } from "./ui";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui";
import { ToolButton } from "./NleToolbar";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "./ui";
import FontSelect, { DEFAULT_FONTS } from "./fonts/FontSelect";
import {
    clipEnd,
    normalizeSubtitleStyle,
    SUBTITLE_FONT_SIZES,
} from "./TimelineClipModel";

/** mm:ss.t — enough precision to see a cue land, short enough to scan. */
function clock(ms) {
    const total = Math.max(0, Math.round(ms));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const tenths = Math.floor((total % 1000) / 100);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/** Accepts what the field shows back, plus plain seconds for quick typing. */
function parseClock(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const parts = text.split(":");
    const seconds = Number(parts.pop());
    if (!Number.isFinite(seconds)) return null;
    const minutes = parts.length ? Number(parts.pop()) : 0;
    if (!Number.isFinite(minutes)) return null;
    return Math.max(0, Math.round(minutes * 60000 + seconds * 1000));
}

function TimeField({ label, ms, onCommit }) {
    const [draft, setDraft] = useState(null);
    const value = draft ?? clock(ms);

    const commit = () => {
        const parsed = parseClock(value);
        setDraft(null);
        if (parsed != null && parsed !== Math.round(ms)) onCommit(parsed);
    };

    return (
        <span className="cs-cue-time">
            <Icon name="clock" size={11} />
            <span className="cs-cue-time-label">{label}</span>
            <input
                className="cs-cue-time-input"
                value={value}
                aria-label={`${label} time`}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                        setDraft(null);
                        e.currentTarget.blur();
                    }
                }}
            />
        </span>
    );
}

/**
 * The seam between two cues. Invisible until you reach for it, which is what
 * keeps a long list readable — the actions are there without being a column of
 * buttons down the page.
 */
function CueSeam({ onAdd, onMerge }) {
    return (
        <div className="cs-cue-seam">
            <Button type="button" variant="outline" size="xs" className="h-6 rounded-md" onClick={onAdd}>
                <Icon name="plus" size={11} />
                Add line
            </Button>
            {onMerge && (
                <Button type="button" variant="outline" size="xs" className="h-6 rounded-md" onClick={onMerge}>
                    <Icon name="merge" size={11} />
                    Merge
                </Button>
            )}
        </div>
    );
}

function CueRow({ entry, active, focused, onSeek, onChangeText, onChangeTime, onDelete, onSplit }) {
    const { item } = entry;
    const rowRef = useRef(null);

    useEffect(() => {
        if (focused) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [focused]);

    return (
        <div
            ref={rowRef}
            className={`cs-cue ${active ? "is-active" : ""} ${focused ? "is-focused" : ""}`}
        >
            <textarea
                className="cs-cue-text"
                rows={2}
                value={item.text || ""}
                placeholder="Subtitle text"
                aria-label={`Subtitle at ${clock(item.startMs)}`}
                onFocus={() => onSeek(item.startMs)}
                onChange={(e) => onChangeText(item._id, e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
            />

            <div className="cs-cue-times">
                <TimeField
                    label="In"
                    ms={item.startMs}
                    onCommit={(ms) => onChangeTime(item._id, { startMs: ms, endMs: clipEnd(item) })}
                />
                <TimeField
                    label="Out"
                    ms={clipEnd(item)}
                    onCommit={(ms) => onChangeTime(item._id, { startMs: item.startMs, endMs: ms })}
                />
            </div>

            <div className="cs-cue-menu">
                <Tooltip text="Subtitle line actions">
                    <DropdownMenuTrigger>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="rounded-md"
                            aria-label="Subtitle line actions"
                        >
                            <Icon name="dots-vertical" size={14} />
                        </Button>
                        <DropdownMenu placement="bottom end" className="min-w-40">
                            <DropdownMenuItem textValue="Jump to this line" onAction={() => onSeek(item.startMs)}>
                                Jump to this line
                            </DropdownMenuItem>
                            <DropdownMenuItem textValue="Split at playhead" onAction={() => onSplit(item._id)}>
                                Split at playhead
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                textValue="Remove"
                                variant="destructive"
                                onAction={() => onDelete(item._id)}
                            >
                                Remove
                            </DropdownMenuItem>
                        </DropdownMenu>
                    </DropdownMenuTrigger>
                </Tooltip>
            </div>
        </div>
    );
}

function StyleBar({ style, onChangeStyle, fonts }) {
    const current = normalizeSubtitleStyle(style);
    const googleFonts = fonts?.length ? fonts : DEFAULT_FONTS;
    const fontsLoading = false;

    return (
        <div className="cs-subs-style" role="group" aria-label="Subtitle look">
            <label className="cs-subs-style-field">
                <span className="cs-subs-style-label">Size</span>
                <Select
                    selectedKey={current.font_size}
                    onSelectionChange={(key) => {
                        if (key) onChangeStyle({ font_size: String(key) });
                    }}
                    aria-label="Subtitle text size"
                    className="cs-subs-style-select w-full"
                >
                    <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SUBTITLE_FONT_SIZES.map((opt) => (
                            <SelectItem key={opt.id} id={opt.id}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>
            <div className="cs-subs-style-field">
                <span className="cs-subs-style-label">Font</span>
                <FontSelect
                    className="cs-subs-font-select"
                    fonts={googleFonts}
                    loading={fontsLoading}
                    value={current.font_family}
                    placeholder="Choose a font"
                    onChange={(family) => {
                        if (family) onChangeStyle({ font_family: family });
                    }}
                />
            </div>
        </div>
    );
}

/**
 * The subtitles, as a script you can read down beside the picture.
 *
 * It opens from the caption in the preview or a cue on the timeline rather than
 * sitting open under the board, because most of the time you are watching, not
 * writing — and when you are writing, you want the line and the frame it lands
 * on side by side.
 */
export default function SubtitlePanel({
    cues,
    currentMs,
    focusId,
    style,
    fonts,
    onSeek,
    onChangeText,
    onChangeTime,
    onChangeStyle,
    onDelete,
    onSplit,
    onAdd,
    onInsertBetween,
    onMerge,
    onClose,
}) {
    const sameRow = useCallback(
        (a, b) => !!a && !!b && a.trackId === b.trackId,
        []
    );

    const resolvedStyle = useMemo(
        () => normalizeSubtitleStyle(style || cues[0]?.item?.style),
        [style, cues],
    );

    return (
        <aside className="cs-subs" aria-label="Subtitles">
            <header className="cs-subs-head">
                <span className="cs-subs-title">
                    Subtitles
                    <span className="cs-subs-count">{cues.length}</span>
                </span>
                <ToolButton tooltip="Close the subtitle list" onClick={onClose}>
                    <Icon name="x" size={14} />
                </ToolButton>
            </header>

            {typeof onChangeStyle === "function" && (
                <StyleBar style={resolvedStyle} onChangeStyle={onChangeStyle} fonts={fonts} />
            )}

            <div className="cs-subs-body">
                {cues.length === 0 && (
                    <p className="field-hint cs-subs-empty">
                        No subtitles on this timeline yet.
                    </p>
                )}

                {cues.map((entry, index) => {
                    const previous = index > 0 ? cues[index - 1] : null;
                    return (
                        <React.Fragment key={entry.item._id}>
                            {previous && (
                                <CueSeam
                                    onAdd={() => onInsertBetween(previous.item._id, entry.item._id)}
                                    onMerge={sameRow(previous, entry)
                                        ? () => onMerge(previous.item._id, entry.item._id)
                                        : null}
                                />
                            )}
                            <CueRow
                                entry={entry}
                                active={currentMs >= entry.item.startMs && currentMs < clipEnd(entry.item)}
                                focused={focusId === entry.item._id}
                                onSeek={onSeek}
                                onChangeText={onChangeText}
                                onChangeTime={onChangeTime}
                                onDelete={onDelete}
                                onSplit={onSplit}
                            />
                        </React.Fragment>
                    );
                })}
            </div>

            <footer className="cs-subs-foot">
                <Button type="button" variant="outline" size="sm" className="cs-subs-add h-7 rounded-md" onClick={() => onAdd()}>
                    <Icon name="plus" size={14} />
                    Add new subtitle line
                </Button>
            </footer>
        </aside>
    );
}
