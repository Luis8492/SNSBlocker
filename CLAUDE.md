# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"YouTube 書き取り関所" — a Chrome extension (Manifest V3) that overlays YouTube video pages (`/watch`, `/shorts`) with a classical-literature dictation quiz. The video stays locked (and force-paused) until all segments of a randomly chosen passage are typed correctly. There is no build step, no package.json, no tests — plain ES5-style vanilla JS loaded directly as content scripts.

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
- `config.js` — sets `K.config.activeQuiz` (currently `"solfege-chord"`; the project runs in plugin mode — multiple quizzes registered, one selected here).
- `continue.js`/`continue.html` — extension-internal page that loops rounds of the active quiz indefinitely.
- `quizzes/dictation/` — classical-literature dictation. `passages.js` puts data at `K.data.dictationPassages`; `dictation.js` holds all dictation-specific logic (normalization, grading, LCS-based diff rendering, the 5-second "覚えた" arming gauge, Ctrl+Enter handling) and calls `K.registerQuiz`. Quiz-specific styles live in `dictation.css` (loaded after `overlay.css`, so it may override `ytg-*` classes).
- `quizzes/hyakunin/` — Hyakunin Isshu dictation: 上の句 (kami) always shown, only 下の句 (shimo) is memorized and typed; no arming delay on "覚えた"; 3 random poems per round (`POEMS_PER_ROUND`). Data (`K.data.hyakuninPoems`, all 100 poems in historical kana from the Ōmi Jingū listing) in `poems.js`. Quizzes must stay self-contained (no cross-quiz dependencies) — hyakunin deliberately duplicates dictation's normalize/diff logic so deleting either quiz folder never breaks the other.
- `quizzes/solfege/` — ear-training quizzes. `chord.js` registers `solfege-chord` (2-note harmonic interval dictation): random bottom note (C4–C5) + random interval (m2–P8), tones synthesized with Web Audio API oscillators (no audio files), answered on a CSS-drawn piano keyboard (C4–C6) where clicking a key auditions it and the ○ dot below selects it (max 2). Wrong answers only color the user's own picks ok/ng — never reveal the correct pitches. Future rhythm/melody quizzes go in this folder as separate quiz ids (`solfege-rhythm`, …).

### Quiz contract

A quiz registers `{ id, title, icon, start(container, ctx) }`. `start` builds one round inside `container`; on clearing all questions it calls `ctx.onComplete({ container, body, ui, el, restart })` and the platform draws the after-clear screen. Grading and other domain logic stay inside the quiz's folder.

### Script load order matters

Content scripts run in this order and share `window.Kansho`: `core/registry.js` → `core/ui.js` → `config.js` → quiz files → `core/host.js` (host must be last so quizzes are registered before the gate starts). `continue.html` mirrors the same order with `continue.js` last.

### Adding a new quiz or file — three places to update

Any new JS/CSS file must be registered in all of:
1. `manifest.json` `content_scripts.js`/`css` (JS after `config.js`, before `core/host.js`; CSS after `core/overlay.css`)
2. `manifest.json` `web_accessible_resources`
3. `continue.html` `<script>`/`<link>` tags

Then point `config.js` `activeQuiz` at the new quiz id. See the "新しいクイズ形式を追加する" section of README.md for the full recipe.

## Behavioral specifics worth knowing

- Unlock state is per-tab-session only: `sessionStorage` key `ytg_unlocked_ids`, one entry per video id (`v:<id>` / `s:<id>`).
- Grading (`normalize` in `dictation.js`) ignores punctuation, symbols, whitespace, full/half-width (NFKC), and letter case; everything else is compared strictly per character. The diff aligns in normalized space but renders original characters (`del` = missing, `ins` = extra/wrong).
- Copy/paste/context-menu blocking is intentionally best-effort — this is a self-restraint tool, not tamper-proofing. Don't add heavier countermeasures.
- Correct answers advance silently by design — no praise or "正解!" messages.
- Question count per round = number of `segments` in the passage; difficulty is tuned by editing `quizzes/dictation/passages.js` only.
