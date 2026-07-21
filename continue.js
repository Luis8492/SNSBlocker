// YouTube 書き取り関所 — 継続ページ
// YouTubeを離れて、ここで書き取りを好きなだけ続ける。
(function () {
  "use strict";

  var el = window.YTGQuiz.el;
  var root = document.getElementById("ytg-root");

  var overlay = el("div", "ytg-overlay");
  var card = el("div", "ytg-card");
  overlay.appendChild(card);
  root.appendChild(overlay);

  var count = 0;

  function start() {
    window.YTGQuiz.createSession(card, { onComplete: onComplete });
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
