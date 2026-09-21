# Public-repository security audit

Gate for publishing this repository. Run `npm run security-scan` before any GitHub or npm publish. Do not treat this as a substitute for `gitleaks`/`trufflehog` if those tools are available later.

**Scan date:** 2026-09-21  
**Repo HEAD at audit:** `0b85104` (LICENSE only) plus uncommitted extraction files — no `mg-ektie-crm` history imported.

## 1. Ektie env vars in the source project (categories, not values)

The Ektie CRM tree (untrusted source material, never copied) holds private config of these kinds:

- Local `.env` / `.env.testing` / service `.env` files (gitignored there, present on disk)
- Laravel `APP_KEY`, database, Redis, mail, Cloudflare, OAuth domain placeholders in `.env.example`
- Kubernetes secret manifests
- AI/provider slots (`GEMINI_*`, `OPENAI_*`, `ANTHROPIC_*`, `TOPAZ_*`, `MOTION_COMPOSER_*`, `FFMPEG_PATH`, renderer URLs)
- Sanctum/session cookie names and `/api/` host wiring via `NetworkProvider`

No values from those files were opened or transcribed into this report.

## 2. Which the editor actually required

**None.** `@ektie/react-video-timeline-editor` has zero environment variables. Persistence, media URLs, fonts, and export are host callbacks and props.

## 3. Which were removed

All of them. Extraction was an allowlist copy of NLE JavaScript/CSS into a new git history. No Ektie `.env*`, k8s, Docker/Make deploy, Bitbucket pipelines, PHP config, or internal URL files exist in this repo.

## 4. Replaced with public abstractions

| Host concern | Package surface |
| --- | --- |
| Media library / uploads | `assets`, `onImportFiles` |
| Fonts | `FontSource` (no brand-kit HTTP) |
| Persistence | `onChange` + host storage (demo uses `localStorage`) |
| Export / download | `onExport`, `slots.headerEnd` (no ffmpeg, no Ektie download route) |

## 5. Files excluded (denylist)

Not copied from Ektie:

- Any `.env*` (including `.env.example`)
- `k8s/`, Docker/Make production targets, `bitbucket-pipelines.yml`
- `NetworkProvider`, EktieUI, brand-kit clients
- `DownloadButton`, `DeliveryChip`, `SimpleTimeline`, `PlaybackPreview`
- `attachMedia`, `checkpointGate`, Director, pipeline, PHP, jobs, prompts, skills, studio bible
- `storage/`, `public/upload`, customer/generated media, logs
- Comments that named PHP classes (`TimelineContract`) or Laravel `creative-studio/` routes (rewritten to host-contract language)

## 6. Credentials / secrets in the extracted repo

**None found.** `npm run security-scan` (pattern list including `API_KEY`, `PRIVATE_KEY`, `DATABASE_URL`, `process.env`, `NEXT_PUBLIC_`, `NetworkProvider`, `EktieUI`, `creative-studio/`, `brand-kit`, JWT-like blobs) reported **0 hits** outside documented allowlisted files (the scanner itself, coupling tests, and docs that mention forbidden tokens by name).

`gitleaks` and `trufflehog` were not installed on the audit machine. `git log --all` contains only `0b85104 Initial commit` (LICENSE + `.gitattributes`).

The Next.js demo runs with **no `.env`**. Editor-required env vars remain **none**.

## 7. Git history vs publication

History was **not** cloned, filtered, or subtree-split from `mg-ektie-crm`. Publication is **not blocked by Ektie git history**.

If patches exported from Ektie are applied later, re-run this gate on the full history, not only HEAD.

## 8. Remaining manual review

- Confirm the copyright holder line (person vs Ektie entity) before GitHub/npm publish.
- Sample media under `demo/nextjs/public/samples/` is generated locally (solid-color video, still, sine tone) — not taken from Ektie object storage.
- The public `ektie.com/creative` footer link in the demo is intentional product attribution, not an internal hostname.
- Install `gitleaks` or `trufflehog` in CI before the first public release.
- Do not publish until this scan is clean on the commit you tag.
