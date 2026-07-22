// Kansho — 継続ページ（基盤層）。
// YouTubeを離れて、ここで出題を好きなだけ続ける。
// クイズ形式は host.js と同じく Kansho.getActiveQuiz に委譲する。
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

  function onComplete(info) {
    count++;
    var b = info.body;
    b.appendChild(el("div", "ytg-hint",
      "ここまで " + count + " セット。よく続けています。"));

    var again = el("button", "ytg-btn ytg-btn-primary ytg-btn-big", "もっと続ける");
    again.addEventListener("click", start);

    var stack = el("div", "ytg-btnstack");
    stack.appendChild(again);
    b.appendChild(stack);
  }

  start();
})();
