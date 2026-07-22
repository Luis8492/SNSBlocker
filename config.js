// Kansho — 出題する形式の選択（基盤層の設定）。
//
// フォーク運用なら、この activeQuiz を目的の形式に書き換える（そのクイズだけ残す）。
// 将来、拡張機能内で切り替える場合は、ここを chrome.storage 等から
// 読むように差し替えれば、host.js / continue.js 側は変更不要。
//
// activeQuiz には、各クイズが registerQuiz で登録した id を指定する。
//   "dictation" : 古典文学の書き取り
//   （将来）      "shogi" : 次の一手／詰将棋、"solfege" : 聴音／リズム など
(function () {
  "use strict";
  var K = window.Kansho || (window.Kansho = {});
  K.config = K.config || {};
  K.config.activeQuiz = "dictation";
})();
