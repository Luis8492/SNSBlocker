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
- `quizzes/koten/` — classical-literature dictation (title 古典文学). `passages.js` puts data at `K.data.kotenPassages`; `koten.js` holds all dictation-specific logic (normalization, grading, LCS-based diff rendering, the 5-second "覚えた" arming gauge, Ctrl+Enter handling) and calls `K.registerQuiz`. Quiz-specific styles live in `koten.css` (loaded after `overlay.css`, so it may override `ytg-*` classes).
- `quizzes/hyakunin/` — Hyakunin Isshu dictation: 上の句 (kami) always shown, only 下の句 (shimo) is memorized and typed; no arming delay on "覚えた"; 3 random poems per round (`POEMS_PER_ROUND`). Data (`K.data.hyakuninPoems`, all 100 poems in historical kana from the Ōmi Jingū listing) in `poems.js`. Quizzes must stay self-contained (no cross-quiz dependencies) — hyakunin deliberately duplicates koten's normalize/diff logic so deleting either quiz folder never breaks the other.
- `quizzes/juon/` — ear training. `juon.js` registers `juon` (2-note harmonic interval dictation, title 重音(2音)): random bottom note (C4–C5) + random interval (m2–P8), tones synthesized with Web Audio API oscillators (no audio files), answered on a CSS-drawn piano keyboard (C4–C6) where clicking a key auditions it and the ○ dot below selects it (max 2). Wrong answers only color the user's own picks ok/ng — never reveal the correct pitches. Future rhythm/melody quizzes go in their own folders as separate quiz ids (`quizzes/rhythm/`, …).
- `quizzes/tsume/` — tsume-shogi (mate-in-3). `shogi.js` is a self-written shogi rules engine (promotion, drops, nifu, uchifuzume, etc.) plus a mate solver (`mateMove` — attacker moves restricted to checks, so depth ≤9 is instant). No solution data is bundled: the solver grades user moves (does the move preserve forced mate within remaining plies? alternate mating lines count as correct) and plays the defender. `problems.js` holds 300 SFEN positions sampled from the やねうら王 5M-problem set (no copyright claimed), normalized to black-to-move and re-verified by our solver (the source's "not mate in N−2" guarantee occasionally misses discovered checks). Raw data lives in `tmp/` (gitignored); regenerate `problems.js` with `scripts/sample_tsume.py` (sample + normalize) → `scripts/gen_problems.js` (solver-verify + emit).

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

The new quiz then appears in the selection panel. See the "新しいクイズ形式を追加する" section of README.md for the full recipe.

## Behavioral specifics worth knowing

- Unlock state is per-tab-session only: `sessionStorage` key `ytg_unlocked_ids`, one entry per video id (`v:<id>` / `s:<id>`).
- Grading (`normalize` in `koten.js`) ignores punctuation, symbols, whitespace, full/half-width (NFKC), and letter case; everything else is compared strictly per character. The diff aligns in normalized space but renders original characters (`del` = missing, `ins` = extra/wrong).
- Copy/paste/context-menu blocking is intentionally best-effort — this is a self-restraint tool, not tamper-proofing. Don't add heavier countermeasures.
- Correct answers advance silently by design — no praise or "正解!" messages.
- Question count per round = number of `segments` in the passage; difficulty is tuned by editing `quizzes/koten/passages.js` only.
