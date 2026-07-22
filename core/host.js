// Kansho — YouTube関所（基盤層のホスト）。
// 動画ページを検知したら画面をオーバーレイし、有効なクイズ形式に出題を委譲する。
// どのクイズ形式かは知らない（Kansho.getActiveQuiz が config.activeQuiz で決める）。
// 全問クリアで「動画を見る」か「YouTubeはやめてもっと続ける!!!」を選ばせる。
(function () {
  "use strict";

  var K = window.Kansho;

  var STORAGE_KEY = "ytg_unlocked_ids";

  var overlay = null;     // オーバーレイ要素
  var card = null;        // クイズの描画先
  var pauseTimer = null;  // 背後の動画を止め続けるタイマー
  var currentId = null;   // ゲート中の動画ID

  // ---- 動画IDの判定 ------------------------------------------------------
  function getVideoId(href) {
    try {
      var u = new URL(href);
      if (u.pathname === "/watch") {
        var v = u.searchParams.get("v");
        return v ? "v:" + v : null;
      }
      var m = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (m) return "s:" + m[1];
      return null;
    } catch (e) {
      return null;
    }
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
    var quiz = K.getActiveQuiz();
    if (!quiz) {
      // 有効なクイズが無い（設定ミス等）。ロックだけはしないで開放する。
      removeOverlay();
      return;
    }
    quiz.start(card, { onComplete: renderCleared });
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

    var watch = el("button", "ytg-btn ytg-btn-ghost", "ソーシャルネットワークへ進む");
    watch.addEventListener("click", function () {
      markUnlocked(currentId);
      removeOverlay();
    });

    var stack = el("div", "ytg-btnstack");
    stack.appendChild(quit);
    stack.appendChild(watch);
    b.appendChild(stack);
  }

  // ---- ナビゲーション検知 ------------------------------------------------
  function onLocationChange() {
    var id = getVideoId(location.href);
    if (id) {
      if (isUnlocked(id)) { removeOverlay(); return; }
      if (overlay && currentId === id) return; // 既に同じ動画を出題中
      startGate(id);
    } else {
      removeOverlay(); // 動画ページ以外に移動したら閉じる
    }
  }

  var lastHref = location.href;
  function checkNav() {
    if (location.href !== lastHref) { lastHref = location.href; onLocationChange(); }
  }

  window.addEventListener("yt-navigate-finish", onLocationChange, true);
  window.addEventListener("popstate", checkNav);
  setInterval(checkNav, 500);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onLocationChange);
  }
  onLocationChange();
})();
