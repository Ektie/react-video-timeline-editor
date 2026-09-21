import React, { useMemo, useRef, useState } from "react";
import { Icon, Modal, Input, Tabs, TabsList, TabsTrigger } from "./ui";
import "./AssetPicker.css";

const ACCEPTS = {
    video: "video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp",
    still: "image/png,image/jpeg,image/webp",
    audio: "audio/mpeg,audio/mp4,audio/wav,audio/aac,audio/ogg,audio/webm",
    music: "audio/mpeg,audio/mp4,audio/wav,audio/aac,audio/ogg,audio/webm",
};

const TITLES = {
    video: "Add to a video row",
    still: "Add stills",
    audio: "Add to a voice row",
    music: "Add to a music row",
};

/**
 * Host-supplied library items: { key, group, title, subtitle, thumbnail, uploaded, draft, types? }
 */
function libraryFor(type, assets) {
    return (assets || []).filter((asset) => {
        if (Array.isArray(asset.types) && asset.types.length) return asset.types.includes(type);
        const draft = asset.draft || {};
        if (type === "video") return !!(draft.video_url || draft.keyframe_url);
        if (type === "still") return !!draft.keyframe_url;
        if (type === "audio" || type === "music") return !!draft.audio_url;
        return false;
    });
}

export default function AssetPicker({
    type,
    assets = [],
    uploading,
    error,
    onPick,
    onUpload,
    onClose,
    title,
}) {
    const library = useMemo(() => libraryFor(type, assets), [type, assets]);
    const [tab, setTab] = useState(library.length ? "library" : "upload");
    const fileRef = useRef(null);
    const groups = useMemo(() => {
        const map = new Map();
        library.forEach((asset) => {
            const group = asset.group || "Library";
            if (!map.has(group)) map.set(group, []);
            map.get(group).push(asset);
        });
        return [...map.entries()].map(([groupTitle, items]) => ({ title: groupTitle, items }));
    }, [library]);

    return (
        <Modal open title={title || TITLES[type] || "Add media"} onClose={onClose} size="lg">
            <div className="cs-picker">
                <Tabs
                    selectedKey={tab}
                    onSelectionChange={(key) => { if (key) setTab(String(key)); }}
                    className="w-full gap-3"
                >
                    <TabsList className="h-8 w-full">
                        <TabsTrigger id="library">Library</TabsTrigger>
                        <TabsTrigger id="upload">Upload</TabsTrigger>
                    </TabsList>
                </Tabs>

                {tab === "library" && (
                    library.length ? (
                        <div className="cs-picker-groups">
                            {groups.map((group) => (
                                <div key={group.title} className="cs-picker-group">
                                    <div className="cs-picker-group-title">{group.title}</div>
                                    <div className="cs-picker-grid">
                                        {group.items.map((asset) => (
                                            <button
                                                type="button"
                                                key={asset.key}
                                                className="cs-picker-item"
                                                onClick={() => onPick(asset.draft)}
                                            >
                                                <span className="cs-picker-thumb">
                                                    {asset.thumbnail
                                                        ? <img src={asset.thumbnail} alt="" />
                                                        : <Icon name={type === "still" ? "photo" : type === "video" ? "video" : "microphone"} size={18} />}
                                                </span>
                                                <span className="cs-picker-meta">
                                                    <strong>{asset.title}</strong>
                                                    <span className="field-hint">{asset.subtitle}</span>
                                                </span>
                                                {asset.uploaded && <span className="cs-badge muted">Uploaded</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="field-hint cs-picker-empty">
                            Nothing in the library for this row yet. Upload a file instead.
                        </p>
                    )
                )}

                {tab === "upload" && (
                    <div className="cs-picker-upload">
                        <Input
                            ref={fileRef}
                            type="file"
                            accept={ACCEPTS[type] || undefined}
                            disabled={uploading || !onUpload}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) onUpload(file);
                            }}
                        />
                        <p className="field-hint">
                            Files are added to the timeline in this session. The host app decides how they are stored.
                        </p>
                        {uploading && <p className="field-hint">Uploading…</p>}
                        {error && <p className="cs-export-error">{error}</p>}
                    </div>
                )}
            </div>
        </Modal>
    );
}
