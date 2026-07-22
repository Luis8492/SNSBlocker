// Kansho — 選択パネルの保存値の読み込み（基盤層の設定）。
//
// 出題プラグイン・対象SNSはツールバーの選択パネル（options.html）で選ばれ、
// chrome.storage.sync に保存される。ここで読み込んで K.config に反映する。
//
// 未設定時（初回インストール直後・フォーク運用・テスト環境）:
//   - 出題プラグイン: 登録済みの全クイズからランダム（registry.js）
//   - 対象SNS: YouTube のみ（sites.js）
// フォーク運用は quizzes/ に目的の形式だけを残せばそれだけが出題される。
(function () {
  "use strict";
  var K = window.Kansho || (window.Kansho = {});
  K.config = K.config || {};

  // 選択パネルの保存値。null = 未ロード/未設定。
  K.config.enabledQuizzes = null;
  K.config.enabledSites = null;

  // ストレージ読み込みは非同期なので、出題開始側（host.js / continue.js）は
  // onReady で読み込み完了を待ってから getActiveQuiz / getActiveSite を呼ぶ。
  var ready = false, cbs = [];
  K.config.onReady = function (cb) { if (ready) cb(); else cbs.push(cb); };
  function fire() {
    ready = true;
    while (cbs.length) cbs.shift()();
  }

  try {
    chrome.storage.sync.get({ enabledQuizzes: null, enabledSites: null }, function (items) {
      K.config.enabledQuizzes = items.enabledQuizzes;
      K.config.enabledSites = items.enabledSites;
      fire();
    });
    // パネルでの変更を開いているタブにも反映する（次の関所/ラウンドから効く）
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") return;
      if (changes.enabledQuizzes) K.config.enabledQuizzes = changes.enabledQuizzes.newValue;
      if (changes.enabledSites) K.config.enabledSites = changes.enabledSites.newValue;
    });
  } catch (e) {
    fire(); // chrome.storage が無い環境（テスト等）では即 ready
  }
})();
