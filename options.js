// Kansho — 出題プラグインの選択パネル（基盤層）。
// ツールバーアイコンのクリック（ポップアップ）または右クリック→「オプション」で開く。
// 登録済みクイズをチェックボックスで並べ、選択を chrome.storage.sync に保存する。
// 複数選択時の出題は registry.js の getActiveQuiz がランダムに選ぶ。
(function () {
  "use strict";

  var K = window.Kansho;
  var list = document.getElementById("list");
  var status = document.getElementById("status");
  var ids = Object.keys(K.quizzes);

  function show(msg, isErr) {
    status.textContent = msg;
    status.className = isErr ? "err" : "";
  }

  function selectedIds() {
    return ids.filter(function (id) {
      return list.querySelector('input[data-id="' + id + '"]').checked;
    });
  }

  function save() {
    var sel = selectedIds();
    if (!sel.length) return; // 0個は onChange 側で阻止済み（保険）
    chrome.storage.sync.set({ enabledQuizzes: sel }, function () {
      show("保存しました");
      setTimeout(function () { show(""); }, 1200);
    });
  }

  function onChange(ev) {
    if (!selectedIds().length) {
      ev.target.checked = true; // 全解除は許さない（出題が空になるため）
      show("最低1つは選んでください", true);
      return;
    }
    save();
  }

  function render(enabled) {
    ids.forEach(function (id) {
      var quiz = K.quizzes[id];
      var label = document.createElement("label");
      label.className = "quiz";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-id", id);
      cb.checked = enabled.indexOf(id) !== -1;
      cb.addEventListener("change", onChange);
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = quiz.badge || "";
      var name = document.createElement("span");
      name.textContent = quiz.title || id;
      label.appendChild(cb);
      label.appendChild(badge);
      label.appendChild(name);
      list.appendChild(label);
    });
  }

  chrome.storage.sync.get({ enabledQuizzes: null }, function (items) {
    var enabled = items.enabledQuizzes;
    if (!enabled || !enabled.length) {
      // 未設定なら従来の既定（config.activeQuiz）を初期選択として表示する
      enabled = (K.config.activeQuiz && K.quizzes[K.config.activeQuiz])
        ? [K.config.activeQuiz]
        : ids;
    }
    render(enabled);
  });
})();
