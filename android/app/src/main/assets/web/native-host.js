// Kansho — Android 版の関所（ゲート）。extension/core/host.js のクリア後画面と
// continue.js のラウンド進行を兼ねる。検知とブロックの実体はネイティブ側
// （WatchdogService / QuizActivity）が担い、ここは出題とクリア後の分岐だけを行う。
(function () {
  "use strict";

  var K = window.Kansho;
  var el = K.ui.el;
  var root = document.getElementById("ytg-root");

  var overlay = el("div", "ytg-overlay");
  var card = el("div", "ytg-card");
  overlay.appendChild(card);
  root.appendChild(overlay);

  var count = 0;

  function start() {
    var quiz = K.getActiveQuiz();
    if (!quiz) {
      card.appendChild(el("div", "ytg-hint", "有効な問題形式がありません。"));
      return;
    }
    quiz.start(card, { onComplete: onComplete });
  }

  // クリア後: 続けるか、N分だけSNSへ進むか（拡張のクリア後画面と同じ2択）。
  function onComplete(info) {
    count++;
    var b = info.body;
    if (count > 1) {
      b.appendChild(el("div", "ytg-hint", "ここまで " + count + " セット。よく続けています。"));
    }

    var minutes = 10;
    try { minutes = window.KanshoNative.getUnlockMinutes(); } catch (e) {}

    var again = el("button", "ytg-btn ytg-btn-primary ytg-btn-big", "もっと続ける!!!");
    again.addEventListener("click", start);

    var go = el("button", "ytg-btn ytg-btn-ghost ytg-btn-big",
      minutes + "分だけソーシャルネットワークへ進む");
    go.addEventListener("click", function () {
      try { window.KanshoNative.unlock(); } catch (e) { /* ブラウザでのデバッグ */ }
    });

    var stack = el("div", "ytg-btnstack");
    stack.appendChild(again);
    stack.appendChild(go);
    b.appendChild(stack);
  }

  if (K.config && K.config.onReady) K.config.onReady(start);
  else start();
})();
