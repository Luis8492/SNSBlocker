// Kansho — 関所（基盤層のホスト）。
// ロック対象ページを検知したら画面をオーバーレイし、有効なクイズ形式に出題を委譲する。
// どのサイトか（sites.js のアダプタが判定）も、どのクイズ形式か
// （Kansho.getActiveQuiz が決める）も知らない。
// 全問クリアで「先へ進む」か「もっと続ける!!!」を選ばせる。
(function () {
  "use strict";

  var K = window.Kansho;

  var STORAGE_KEY = "ytg_unlocked_ids";

  var overlay = null;     // オーバーレイ要素
  var card = null;        // クイズの描画先
  var pauseTimer = null;  // 背後のメディアを止め続けるタイマー
  var currentId = null;   // ゲート中のロックキー（site.id + ":" + lockId）

  // ---- ロック対象の判定（サイトアダプタに委譲） --------------------------
  // 返り値: "youtube:v:xxxx" / "x:site" のようなロックキー。対象外なら null。
  function currentLockKey() {
    var site = K.getActiveSite(location.hostname);
    if (!site) return null;
    var id = site.lockId(location.href);
    return id ? site.id + ":" + id : null;
  }

  // ---- 解除済みIDの記録（セッション単位） --------------------------------
  function loadUnlocked() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function isUnlocked(id) { return loadUnlocked().indexOf(id) !== -1; }
  function markUnlocked(id) {
    var arr = loadUnlocked();
    if (arr.indexOf(id) === -1) {
      arr.push(id);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {}
    }
  }

  // ---- オーバーレイの生成／破棄 ------------------------------------------
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "ytg-overlay";
    card = document.createElement("div");
    card.className = "ytg-card";
    overlay.appendChild(card);
    (document.documentElement || document.body).appendChild(overlay);
    document.documentElement.classList.add("ytg-lock-scroll");

    pauseTimer = setInterval(function () {
      var vids = document.querySelectorAll("video");
      for (var i = 0; i < vids.length; i++) {
        if (!vids[i].paused) { try { vids[i].pause(); } catch (e) {} }
      }
    }, 400);
  }

  function removeOverlay() {
    if (pauseTimer) { clearInterval(pauseTimer); pauseTimer = null; }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    card = null;
    currentId = null;
    document.documentElement.classList.remove("ytg-lock-scroll");
  }

  // ---- 出題開始 ----------------------------------------------------------
  function startGate(id) {
    ensureOverlay();
    currentId = id;
    // 選択パネルの設定（chrome.storage）の読み込みを待ってから出題する。
    // オーバーレイは先に張っておく（待ち時間中も動画は見せない）。
    var launch = function () {
      if (currentId !== id || !card) return; // 待つ間に閉じた/別動画へ移った
      var quiz = K.getActiveQuiz();
      if (!quiz) {
        // 有効なクイズが無い（設定ミス等）。ロックだけはしないで開放する。
        removeOverlay();
        return;
      }
      quiz.start(card, { onComplete: renderCleared });
    };
    if (K.config && K.config.onReady) K.config.onReady(launch);
    else launch();
  }

  // 全問クリア後の選択画面（クイズ形式に依存しない基盤の画面）
  function renderCleared(info) {
    var b = info.body, el = info.el;
    b.appendChild(el("div", "ytg-hint", "すべて解き終えました。さて、どうしますか。"));

    var quit = el("button", "ytg-btn ytg-btn-primary ytg-btn-big",
      "もっと続ける!!!");
    quit.addEventListener("click", function () {
      // YouTubeを離れ、拡張機能内の継続ページへ遷移する。
      try {
        window.location.href = chrome.runtime.getURL("continue.html");
      } catch (e) {
        window.location.href = "about:blank";
      }
    });

    var proceed = el("button", "ytg-btn ytg-btn-ghost", "ソーシャルネットワークへ進む");
    proceed.addEventListener("click", function () {
      markUnlocked(currentId);
      removeOverlay();
    });

    var stack = el("div", "ytg-btnstack");
    stack.appendChild(quit);
    stack.appendChild(proceed);
    b.appendChild(stack);
  }

  // ---- ナビゲーション検知 ------------------------------------------------
  function onLocationChange() {
    var key = currentLockKey();
    if (key) {
      if (isUnlocked(key)) { removeOverlay(); return; }
      if (overlay && currentId === key) return; // 既に同じ対象を出題中
      startGate(key);
    } else {
      removeOverlay(); // ロック対象ページ以外に移動したら閉じる
    }
  }

  var lastHref = location.href;
  function checkNav() {
    if (location.href !== lastHref) { lastHref = location.href; onLocationChange(); }
  }

  // yt-navigate-finish は YouTube 固有のSPA遷移イベント。他サイトのSPA遷移は
  // 500ms の href ポーリングが拾う（X・Instagram 等は history API 遷移のため）。
  window.addEventListener("yt-navigate-finish", onLocationChange, true);
  window.addEventListener("popstate", checkNav);
  setInterval(checkNav, 500);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onLocationChange);
  }
  // enabledSites の読み込み（chrome.storage・非同期）を待ってから初回判定する。
  // YouTube 以外のサイトは設定値が無いと対象かどうか判定できないため。
  if (K.config && K.config.onReady) K.config.onReady(onLocationChange);
  else onLocationChange();
})();
