import React, { useMemo, useState } from "react";
import { Button, Icon } from "./ui";
import { Input } from "./ui";
import { Label } from "./ui";
import { Switch } from "./ui";
import { ToolButton } from "./NleToolbar";
import AssetPicker from "./AssetPicker";
import {
    CANVAS_ABSTRACT_PRESETS,
    CANVAS_DEFAULT_COLOR,
    CANVAS_PLATE_MAX_MS,
    CANVAS_PLATE_MIN_MS,
    abstractCss,
    normalizeCanvas,
} from "./TimelineClipModel";

function plateFromDraft(draft) {
    return {
        image_url: draft?.keyframe_url || draft?.cutout_url || draft?.video_url || null,
        image_asset_id: draft?.asset_id || null,
        frame_id: draft?.frame_id || null,
    };
}

function SlotThumb({ url, empty }) {
    return (
        <span className="cs-canvas-thumb">
            {url ? <img src={url} alt="" /> : <span className="field-hint">{empty}</span>}
        </span>
    );
}

/**
 * Canvas rail: backdrop, intro, and outro — same slot as the subtitle list.
 */
export default function CanvasPanel({
    canvas,
    assets = [],
    uploading = false,
    uploadError = null,
    onChange,
    onUpload,
    onClose,
}) {
    const current = useMemo(() => normalizeCanvas(canvas), [canvas]);
    const [picker, setPicker] = useState(null);

    const patch = (next) => onChange?.(normalizeCanvas({ ...current, ...next }));

    const patchBackdrop = (next, extra = {}) => patch({
        ...extra,
        backdrop: { ...current.backdrop, ...next },
    });

    const applyPick = (slot, draft) => {
        const plate = plateFromDraft(draft);
        if (slot === "backdrop") {
            patchBackdrop({ mode: "image", enabled: true, ...plate });
        } else {
            patch({
                [slot]: {
                    ...current[slot],
                    ...plate,
                },
            });
        }
        setPicker(null);
    };

    const applyUpload = async (slot, file) => {
        if (!onUpload || !file) return;
        const draft = await onUpload(file, "still");
        applyPick(slot, draft);
    };

    const setMode = (mode) => {
        patchBackdrop({ mode, enabled: true });
        if (mode === "image" && !current.backdrop.image_url) {
            setPicker("backdrop");
        }
    };

    return (
        <aside className="cs-subs cs-canvas" aria-label="Canvas">
            <header className="cs-subs-head">
                <span className="cs-subs-title">Canvas</span>
                <ToolButton tooltip="Close the canvas rail" onClick={onClose}>
                    <Icon name="x" size={14} />
                </ToolButton>
            </header>

            <div className="cs-subs-body cs-canvas-body">
                <section className="cs-canvas-section" aria-label="Backdrop">
                    <div className="cs-canvas-kicker-row">
                        <div className="cs-canvas-kicker">Backdrop</div>
                        <Switch
                            size="sm"
                            isSelected={current.backdrop.enabled}
                            onChange={(on) => patchBackdrop({ enabled: !!on })}
                            aria-label="Show a backdrop around the picture"
                        />
                    </div>
                    <div className="cs-canvas-modes" role="group" aria-label="Backdrop look">
                        {[
                            { id: "color", label: "Color" },
                            { id: "image", label: "Image" },
                            { id: "abstract", label: "Abstract" },
                        ].map((mode) => (
                            <Button
                                key={mode.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-7 rounded-md ${current.backdrop.mode === mode.id ? "border-human/40 bg-human/10 text-human" : ""}`}
                                onClick={() => setMode(mode.id)}
                            >
                                {mode.label}
                            </Button>
                        ))}
                    </div>

                    {current.backdrop.mode === "color" && (
                        <label className="cs-canvas-color">
                            <span className="cs-subs-style-label">Color</span>
                            <input
                                type="color"
                                value={current.backdrop.color || CANVAS_DEFAULT_COLOR}
                                aria-label="Backdrop color"
                                onChange={(e) => patchBackdrop({
                                    enabled: true,
                                    mode: "color",
                                    color: e.target.value,
                                })}
                            />
                        </label>
                    )}

                    {current.backdrop.mode === "image" && (
                        <div className="cs-canvas-slot">
                            <SlotThumb url={current.backdrop.image_url} empty="No image yet" />
                            <div className="cs-canvas-slot-actions">
                                <Button type="button" variant="outline" size="sm" className="h-7 rounded-md" onClick={() => setPicker("backdrop")}>
                                    Choose
                                </Button>
                                {current.backdrop.image_url && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 rounded-md"
                                        onClick={() => patchBackdrop({
                                            image_url: null,
                                            image_asset_id: null,
                                            frame_id: null,
                                        })}
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    {current.backdrop.mode === "abstract" && (
                        <div className="cs-canvas-abstracts" role="list">
                            {Object.entries(CANVAS_ABSTRACT_PRESETS).map(([id, recipe]) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`cs-canvas-abstract ${current.backdrop.abstract_preset === id ? "is-selected" : ""}`}
                                    style={{ background: abstractCss(id) }}
                                    aria-label={recipe.label}
                                    aria-pressed={current.backdrop.abstract_preset === id}
                                    onClick={() => patchBackdrop({
                                        enabled: true,
                                        mode: "abstract",
                                        abstract_preset: id,
                                    })}
                                >
                                    <span>{recipe.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {["intro", "outro"].map((slot) => {
                    const plate = current[slot];
                    const seconds = plate.duration_ms / 1000;
                    return (
                        <section key={slot} className="cs-canvas-section" aria-label={slot === "intro" ? "Intro" : "Outro"}>
                            <div className="cs-canvas-kicker">{slot === "intro" ? "Intro" : "Outro"}</div>
                            <div className="cs-canvas-slot">
                                <SlotThumb url={plate.image_url} empty="None" />
                                <div className="cs-canvas-slot-actions">
                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-md" onClick={() => setPicker(slot)}>
                                        Choose
                                    </Button>
                                    {plate.image_url && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 rounded-md"
                                            onClick={() => patch({
                                                [slot]: { ...plate, image_url: null, image_asset_id: null, frame_id: null },
                                            })}
                                        >
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {plate.image_url && (
                                <Label className="cs-canvas-duration">
                                    <span className="cs-subs-style-label">Hold {seconds.toFixed(1)}s</span>
                                    <Input
                                        type="range"
                                        min={CANVAS_PLATE_MIN_MS / 1000}
                                        max={CANVAS_PLATE_MAX_MS / 1000}
                                        step={0.1}
                                        value={seconds}
                                        aria-label={`${slot} hold`}
                                        onChange={(e) => patch({
                                            [slot]: { ...plate, duration_ms: Math.round(Number(e.target.value) * 1000) },
                                        })}
                                    />
                                </Label>
                            )}
                        </section>
                    );
                })}
            </div>

            {picker && (
                <AssetPicker
                    type="still"
                    assets={assets}
                    uploading={uploading}
                    error={uploadError}
                    title={picker === "backdrop" ? "Choose a backdrop" : picker === "intro" ? "Choose an intro still" : "Choose an outro still"}
                    onPick={(draft) => applyPick(picker, draft)}
                    onUpload={(file) => applyUpload(picker, file)}
                    onClose={() => setPicker(null)}
                />
            )}
        </aside>
    );
}
