# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"YouTube 書き取り関所" — a Chrome extension (Manifest V3) that overlays YouTube video pages (`/watch`, `/shorts`) with a quiz gate (dictation, ear training, tsume-shogi). The video stays locked (and force-paused) until all segments of a randomly chosen passage are typed correctly. There is no build step, no package.json, no tests — plain ES5-style vanilla JS loaded directly as content scripts.

Comments, commit messages, and UI text are all in Japanese; follow that convention.

## Development

- No build/lint/test commands. To run: load the repo folder unpacked via `chrome://extensions` (developer mode), then open a YouTube video. After edits, reload the extension there and refresh the tab.
- `continue.html` is the standalone "keep practicing" page (reached after clearing a quiz); it can be opened directly as `chrome-extension://<id>/continue.html` for quick manual testing without YouTube.

## Architecture: platform (`core/`) vs. quiz plugins (`quizzes/`)

Everything hangs off a shared global `window.Kansho` (K). The platform layer knows nothing about quiz types; quizzes self-register into a registry and the platform delegates to whichever one `config.js` selects.

- `core/registry.js` — creates `window.Kansho`, `K.registerQuiz(spec)`, `K.getActiveQuiz()` (uses `K.config.activeQuiz`, falls back to first registered quiz). Also owns `K.data` (quiz data namespace) and `K.config`.
- `core/ui.js` — quiz-agnostic UI helpers exposed as `K.ui`: `el` (DOM builder), `forbidCopy`/`forbidPaste`, `renderHeader` (title + progress dots + "問 i / n").
- `core/host.js` — the YouTube gate: detects video navigation (via `yt-navigate-finish`, `popstate`, and a 500 ms href poll — YouTube is an SPA), builds the overlay, pauses all `<video>` elements on a 400 ms interval, calls `quiz.start(card, { onComplete })`, and renders the post-clear choice screen ("continue practicing" → `continue.html`, or unlock the video).
- `core/overlay.css` — shared styles. All classes are prefixed `ytg-`.
- `config.js` — loads the quiz selection from `chrome.storage.sync` (`enabledQuizzes`, an array of quiz ids saved by the options panel) and exposes `K.config.onReady(cb)` since that read is async — `host.js`/`continue.js` wait on it before starting a quiz. `K.config.activeQuiz` (currently `"tsume"`) is the fallback when storage is unset (first run / fork mode). With multiple ids enabled, `K.getActiveQuiz()` picks one at random per call (= per video gate / per continue-page round); a round's questions all come from that one quiz.
- `options.html`/`options.js` — plugin selection panel, opened from the toolbar icon (click = popup, right-click → オプション). Checkbox list of registered quizzes (multi-select, minimum one), saved to `chrome.storage.sync`; changes propagate to open tabs via `chrome.storage.onChanged` and take effect from the next gate/round.
- `continue.js`/`continue.html` — extension-internal page that loops rounds of the active quiz indefinitely.
- `quizzes/<id>/` — one folder per quiz plugin: `koten` (古典文学 dictation), `hyakunin` (百人一首), `juon` (重音(2音) ear training), `tsume` (詰将棋 — registers three quiz ids `tsume`/`tsume5`/`tsume7` for 3/5/7手詰 from one folder via `VARIANTS`; includes its own shogi rules engine + mate solver in `shogi.js`). **Each plugin documents its behavior, data provenance, grading rules, and tuning knobs in its own `quizzes/<id>/README.md` — read that before modifying a quiz, and keep it updated.** Quizzes must stay self-contained (no cross-quiz dependencies) — koten and hyakunin deliberately duplicate their normalize/diff logic so deleting either folder never breaks the other. Quiz data goes to `K.data.<name>`; tsume's raw source data lives in `tmp/` (gitignored) with regeneration scripts in `scripts/`.

### Quiz contract

A quiz registers `{ id, title, icon, start(container, ctx) }`. `start` builds one round inside `container`; on clearing all questions it calls `ctx.onComplete({ container, body, ui, el, restart })` and the platform draws the after-clear screen. Grading and other domain logic stay inside the quiz's folder.

### Script load order matters

Content scripts run in this order and share `window.Kansho`: `core/registry.js` → `core/ui.js` → `config.js` → quiz files → `core/host.js` (host must be last so quizzes are registered before the gate starts). `continue.html` mirrors the same order with `continue.js` last.

### Adding a new quiz or file — four places to update

Any new JS/CSS file must be registered in all of:
1. `manifest.json` `content_scripts.js`/`css` (JS after `config.js`, before `core/host.js`; CSS after `core/overlay.css`)
2. `manifest.json` `web_accessible_resources`
3. `continue.html` `<script>`/`<link>` tags
4. `options.html` `<script>` tags (JS only — the panel enumerates registered quizzes; no quiz CSS needed there)

The new quiz then appears in the selection panel. Also write a `quizzes/<id>/README.md` describing the plugin. See the "新しいクイズ形式を追加する" section of README.md for the full recipe.

## Behavioral specifics worth knowing

- Unlock state is per-tab-session only: `sessionStorage` key `ytg_unlocked_ids`, one entry per video id (`v:<id>` / `s:<id>`).
- Copy/paste/context-menu blocking is intentionally best-effort — this is a self-restraint tool, not tamper-proofing. Don't add heavier countermeasures.
- Quiz-specific behavior (grading rules, feedback style, difficulty tuning) is documented per plugin in `quizzes/<id>/README.md`.
