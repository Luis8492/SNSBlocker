// Kansho — 出題する形式の選択（基盤層の設定）。
//
// 通常運用: ツールバーアイコンの選択パネル（options.html）で選んだクイズが
// chrome.storage.sync の enabledQuizzes（id の配列）に保存され、ここで読み込む。
// 複数選択時は getActiveQuiz が関所ごとにランダムで1つ選ぶ。
//
// フォーク運用: ストレージ未設定のときは activeQuiz が使われるので、
// この値を目的の形式に書き換えるだけでよい（パネルを使わないなら storage 部分は不要）。
//   "koten"    : 古典文学の書き取り
//   "hyakunin" : 百人一首の書き取り（上の句を見て下の句を書く）
//   "juon"     : 重音(2音)の聴音（2音を聴き取り鍵盤で答える）
//   "tsume"    : 詰将棋(3手詰)（盤クリックで詰手順を指す）
//   "tsume5"   : 詰将棋(5手詰)
//   "tsume7"   : 詰将棋(7手詰)
(function () {
  "use strict";
  var K = window.Kansho || (window.Kansho = {});
  K.config = K.config || {};

  // ストレージ未設定時（初回・フォーク運用）の既定
  K.config.activeQuiz = "tsume";

  // 選択パネルの保存値。null = 未ロード/未設定（activeQuiz にフォールバック）。
  K.config.enabledQuizzes = null;

  // ストレージ読み込みは非同期なので、出題開始側（host.js / continue.js）は
  // onReady で読み込み完了を待ってから getActiveQuiz を呼ぶ。
  var ready = false, cbs = [];
  K.config.onReady = function (cb) { if (ready) cb(); else cbs.push(cb); };
  function fire() {
    ready = true;
    while (cbs.length) cbs.shift()();
  }

  try {
    chrome.storage.sync.get({ enabledQuizzes: null }, function (items) {
      K.config.enabledQuizzes = items.enabledQuizzes;
      fire();
    });
    // パネルでの変更を開いているタブにも反映する（次の関所/ラウンドから効く）
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "sync" && changes.enabledQuizzes) {
        K.config.enabledQuizzes = changes.enabledQuizzes.newValue;
      }
    });
  } catch (e) {
    fire(); // chrome.storage が無い環境（テスト等）では即 ready
  }
})();
