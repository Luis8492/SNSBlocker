// Kansho — Android 版の設定読み込み。extension/config.js に相当する。
// chrome.storage の代わりに、QuizActivity の JS ブリッジ（KanshoNative）から
// 有効クイズを同期的に受け取る。ブリッジが無い環境（PCブラウザでの確認等）でも
// そのまま動く（未設定＝全クイズ）。
(function () {
  "use strict";
  var K = window.Kansho || (window.Kansho = {});
  K.config = K.config || {};

  var enabled = null;
  try {
    enabled = JSON.parse(window.KanshoNative.getEnabledQuizzes());
  } catch (e) { /* ブリッジなし（ブラウザでのデバッグ）→ 全クイズ */ }
  K.config.enabledQuizzes = (enabled && enabled.length) ? enabled : null;
  K.config.enabledSites = null; // サイト概念はネイティブ側（TargetApps）が担う

  // ブリッジは同期なので即 ready。
  K.config.onReady = function (cb) { cb(); };
})();
