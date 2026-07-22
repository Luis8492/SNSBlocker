// Kansho — 出題する形式の選択（基盤層の設定）。
//
// フォーク運用なら、この activeQuiz を目的の形式に書き換える（そのクイズだけ残す）。
// 将来、拡張機能内で切り替える場合は、ここを chrome.storage 等から
// 読むように差し替えれば、host.js / continue.js 側は変更不要。
//
// activeQuiz には、各クイズが registerQuiz で登録した id を指定する。
//   "dictation"     : 古典文学の書き取り
//   "hyakunin"      : 百人一首の書き取り（上の句を見て下の句を書く）
//   "solfege-chord" : ソルフェージュの重音聴音（2音を聴き取り鍵盤で答える）
//   "tsume"         : 詰将棋（3手詰め・盤クリックで詰手順を指す）
//   （将来）          "solfege-rhythm" : リズム聴音、"solfege-melody" : 旋律聴音 など
(function () {
  "use strict";
  var K = window.Kansho || (window.Kansho = {});
  K.config = K.config || {};
  K.config.activeQuiz = "tsume";
})();
