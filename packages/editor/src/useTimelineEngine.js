import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
    deepClone,
    normalizeTracks,
    overlappingTrackIds,
    serializeTracks,
    subtitlesFromTracks,
    totalFromTracks,
    wallClockTotalMs,
} from "./TimelineClipModel";

const HISTORY_LIMIT = 60;

/**
 * Edit state for the Cuts timeline.
 *
 * A reducer, not a pile of setState calls: the previous implementation queued
 * history writes and network saves from inside a setState updater, which fires
 * twice under StrictMode and made undo unreliable. Here the reducer only
 * computes state, and the save is an effect keyed on a revision counter.
 *
 * Drags use live() for the frames in between and endDrag() once, so a whole
 * drag is a single undo step.
 */
function reducer(state, action) {
    switch (action.type) {
        case "hydrate":
            return {
                tracks: action.tracks,
                history: [],
                future: [],
                revision: 0,
                selection: new Set(),
            };

        case "commit": {
            if (action.tracks === state.tracks) return state;
            return {
                ...state,
                tracks: action.tracks,
                history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.tracks],
                future: [],
                revision: state.revision + 1,
            };
        }

        // Transient frame of a drag — no history, no save.
        case "live":
            return action.tracks === state.tracks
                ? state
                : { ...state, tracks: action.tracks };

        // Close a drag: one history entry for the whole gesture.
        case "endDrag":
            return {
                ...state,
                history: [...state.history.slice(-(HISTORY_LIMIT - 1)), action.before],
                future: [],
                revision: state.revision + 1,
            };

        case "undo": {
            if (!state.history.length) return state;
            const previous = state.history[state.history.length - 1];
            return {
                ...state,
                tracks: previous,
                history: state.history.slice(0, -1),
                future: [state.tracks, ...state.future],
                revision: state.revision + 1,
            };
        }

        case "redo": {
            if (!state.future.length) return state;
            const [next, ...rest] = state.future;
            return {
                ...state,
                tracks: next,
                history: [...state.history, state.tracks],
                future: rest,
                revision: state.revision + 1,
            };
        }

        case "select":
            return { ...state, selection: action.selection };

        default:
            return state;
    }
}

export default function useTimelineEngine(timeline, onChange) {
    const [state, dispatch] = useReducer(reducer, timeline, (initial) => ({
        tracks: normalizeTracks(initial),
        history: [],
        future: [],
        revision: 0,
        selection: new Set(),
    }));

    const tracksRef = useRef(state.tracks);
    tracksRef.current = state.tracks;

    const selectionRef = useRef(state.selection);
    selectionRef.current = state.selection;

    const dragBeforeRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Re-read only when the server hands us a different timeline. Re-normalizing
    // on every poll would stomp the edit in progress.
    const timelineId = timeline?.id ?? null;
    const hydratedRef = useRef(timelineId);
    useEffect(() => {
        if (hydratedRef.current === timelineId) return;
        hydratedRef.current = timelineId;
        dispatch({ type: "hydrate", tracks: normalizeTracks(timeline) });
    }, [timelineId, timeline]);

    // The save lives here, outside the reducer, and skips the initial render so
    // simply opening Cuts never writes to the server.
    const lastSavedRevision = useRef(0);
    useEffect(() => {
        if (state.revision === lastSavedRevision.current) return;
        lastSavedRevision.current = state.revision;
        onChangeRef.current?.({
            tracks: serializeTracks(state.tracks),
            total_duration_ms: wallClockTotalMs(state.tracks),
            subtitles: subtitlesFromTracks(state.tracks),
        });
    }, [state.revision, state.tracks]);

    /** Apply a pure reducer and record one undo step. */
    const commit = useCallback((updater) => {
        const next = typeof updater === "function" ? updater(tracksRef.current) : updater;
        if (!next) return;
        dispatch({ type: "commit", tracks: next });
    }, []);

    /** Snapshot before a gesture starts so endDrag can record it. */
    const beginDrag = useCallback(() => {
        dragBeforeRef.current = deepClone(tracksRef.current);
    }, []);

    const live = useCallback((updater) => {
        const next = typeof updater === "function" ? updater(tracksRef.current) : updater;
        if (!next) return;
        dispatch({ type: "live", tracks: next });
    }, []);

    /** Close a gesture. `moved` false discards the history entry. */
    const endDrag = useCallback((moved) => {
        const before = dragBeforeRef.current;
        dragBeforeRef.current = null;
        if (!moved || !before) return;
        dispatch({ type: "endDrag", before });
    }, []);

    const undo = useCallback(() => dispatch({ type: "undo" }), []);
    const redo = useCallback(() => dispatch({ type: "redo" }), []);

    const setSelection = useCallback((selection) => {
        const next = selection instanceof Set ? selection : new Set(selection);
        dispatch({ type: "select", selection: next });
    }, []);

    const totalMs = useMemo(() => wallClockTotalMs(state.tracks), [state.tracks]);
    // Abutted length still drives the board width so clips keep their positions.
    const boardMs = useMemo(() => totalFromTracks(state.tracks), [state.tracks]);
    const overlaps = useMemo(() => overlappingTrackIds(state.tracks), [state.tracks]);

    return {
        tracks: state.tracks,
        tracksRef,
        selection: state.selection,
        selectionRef,
        setSelection,
        totalMs,
        boardMs,
        overlaps,
        canUndo: state.history.length > 0,
        canRedo: state.future.length > 0,
        commit,
        live,
        beginDrag,
        endDrag,
        undo,
        redo,
    };
}
