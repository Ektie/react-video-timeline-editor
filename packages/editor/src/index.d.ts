import type { CSSProperties, ReactNode } from "react";

export interface TimelineProject {
    id?: string;
    name?: string;
    aspect_ratio?: string;
    resolution?: string;
    canvas?: unknown;
    tracks?: unknown[];
    subtitles?: unknown[];
    total_duration_ms?: number;
}

export interface EditorAsset {
    key: string;
    group?: string;
    title: string;
    subtitle?: string;
    thumbnail?: string | null;
    uploaded?: boolean;
    types?: string[];
    draft: Record<string, unknown>;
}

export interface VideoTimelineEditorProps {
    project?: TimelineProject | null;
    onChange?: (project: TimelineProject) => void;
    assets?: EditorAsset[];
    fonts?: string[];
    onImportFiles?: (input: { files: File[]; trackType: string }) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
    aspectRatio?: string;
    resolution?: string;
    saveState?: "idle" | "saving" | "saved" | "error";
    savedAt?: number | Date | string | null;
    onRetrySave?: () => void;
    onExport?: () => void | Promise<void> | boolean | Promise<boolean>;
    slots?: {
        headerStart?: ReactNode;
        headerEnd?: ReactNode;
        toolbarExtra?: ReactNode | ((context: {
            selection: string[];
            tracks: unknown[];
            currentMs: number;
            totalMs: number;
            splitAtPlayhead: () => void;
        }) => ReactNode);
        contextMenuExtra?: ReactNode | ((context: {
            clipId: string | null;
            clip?: unknown;
            track?: unknown;
            close: () => void;
        }) => ReactNode);
        emptyState?: ReactNode | (() => ReactNode);
    };
    className?: string;
    style?: CSSProperties;
}

export function VideoTimelineEditor(props: VideoTimelineEditorProps): JSX.Element;
export function createEmptyProject(options?: {
    id?: string;
    name?: string;
    aspectRatio?: string;
    resolution?: string;
}): TimelineProject;
export function normalizeProject(project?: TimelineProject | null): TimelineProject;
export function mergeProjectPatch(project: TimelineProject | null | undefined, patch?: Partial<TimelineProject>): TimelineProject;

export const TRACK_ORDER: string[];
export const TRACK_LABELS: Record<string, string>;
export function serializeTracks(tracks: unknown): unknown[];
export function normalizeTracks(timeline: unknown): unknown[];
export function wallClockTotalMs(tracks: unknown): number;

export function ToolButton(props: {
    tooltip: string;
    label?: ReactNode;
    className?: string;
    children?: ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    [key: string]: unknown;
}): JSX.Element;

export function ToolToggle(props: {
    tooltip: string;
    label?: ReactNode;
    isSelected?: boolean;
    className?: string;
    children?: ReactNode;
    onChange?: (selected: boolean) => void;
    [key: string]: unknown;
}): JSX.Element;

export function ToolSep(): JSX.Element;

export function CtxItem(props: {
    shortcut?: string;
    isActive?: boolean;
    className?: string;
    children?: ReactNode;
    onPointerDown?: (e: React.PointerEvent) => void;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    [key: string]: unknown;
}): JSX.Element;

