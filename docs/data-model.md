# Timeline data model

Serialized `project.tracks` is the document a host renderer should replay.

## Track types

`zoom`, `spotlight`, `video`, `still`, `audio`, `subtitle`, `music`

Picture rows (video + still) are a stack: array order is paint order, `video-0` is the occupying spine.

## Media clips (video / audio / music)

- `position` — start on the timeline (ms)
- `in` / `out` — source trim (ms)
- `speed` — playback rate; wall duration is `(out - in) / speed`
- `video_url` / `audio_url` / `keyframe_url`
- Optional: `transition_out`, `pip`, `split`, `source_crop`
- Extra keys (ids, roles, metadata) round-trip if present

## Cue clips (subtitle / zoom / spotlight)

Absolute `in` / `out` on the timeline. Zoom/spotlight also have `rect` `{ x, y, w, h }` in 0–1.

## Canvas

```js
{
  backdrop: { enabled, mode: "color"|"image"|"abstract", color, image_url },
  intro: { image_url, duration_ms },
  outro: { image_url, duration_ms }
}
```
