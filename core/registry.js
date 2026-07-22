// Kansho — 基盤（プラットフォーム）層のレジストリ。
//
// クイズ形式（書き取り／将棋の次の一手・詰将棋／ソルフェージュ…）は、
// この registerQuiz で自分自身を登録する。基盤側（host.js・continue.js）は
// どの形式かを一切知らず、config.activeQuiz で選ばれたクイズを起動するだけ。
//
// これにより「基盤部分」と「クイズ部分」が分離され、
//   - フォーク運用: 不要な quizzes/ フォルダを削除するだけで済む
//   - 拡張機能内で切替: 複数のクイズを登録し config で選択する
// のどちらにも対応できる。
(function () {
  "use strict";

  var K = window.Kansho || (window.Kansho = {});
  K.quizzes = K.quizzes || {}; // id -> quiz spec
  K.data = K.data || {};       // 各クイズが読み込むデータの置き場
  K.config = K.config || {};   // config.js が activeQuiz 等を設定する

  // クイズ形式を登録する。
  //   spec.id     : 一意なID（config.activeQuiz と対応させる）
  //   spec.title  : 表示名（ヘッダ・選択パネルに出す）
  //   spec.badge  : 判子バッジ用の漢字一字（例 "古"。絵文字は使わない）
  //   spec.start  : function(container, ctx) — 1ラウンドを container 内に構築する。
  //                 全問クリアで ctx.onComplete({ container, body, ui, el, restart }) を呼ぶ。
  //                 ctx.onComplete は基盤側が渡すコールバック（クリア後画面の描画を担当）。
  K.registerQuiz = function (spec) {
    if (!spec || !spec.id || typeof spec.start !== "function") {
      throw new Error("Kansho.registerQuiz: spec.id と spec.start(container, ctx) が必要です");
    }
    K.quizzes[spec.id] = spec;
  };

  // 有効なクイズを返す。
  //   1. config.enabledQuizzes（選択パネルで保存された id の配列）があれば、
  //      その中からランダムに選ぶ（複数選択時は呼び出しごと＝関所ごとに変わる）。
  //      1ラウンドの全問は同じクイズから出る（ラウンド内で再抽選しないため）。
  //   2. 無ければ config.activeQuiz（フォーク運用向けの静的指定）。
  //   3. それも無ければ最初に登録されたもの。
  K.getActiveQuiz = function () {
    var ids = Object.keys(K.quizzes);
    if (!ids.length) return null;
    var enabled = K.config.enabledQuizzes;
    if (enabled && enabled.length) {
      var pool = [];
      for (var i = 0; i < enabled.length; i++) {
        if (K.quizzes[enabled[i]]) pool.push(enabled[i]);
      }
      if (pool.length) {
        return K.quizzes[pool[Math.floor(Math.random() * pool.length)]];
      }
    }
    var id = K.config.activeQuiz;
    if (id && K.quizzes[id]) return K.quizzes[id];
    return K.quizzes[ids[0]];
  };
})();
