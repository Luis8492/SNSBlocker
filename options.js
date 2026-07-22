// Kansho — 出題プラグイン・対象SNSの選択パネル（基盤層）。
// ツールバーアイコンのクリック（ポップアップ）または右クリック→「オプション」で開く。
// 登録済みのクイズとサイトをチェックボックスで並べ、選択を chrome.storage.sync に保存する。
//   enabledQuizzes : 出題プラグイン（複数選択時は registry.js がランダムに選ぶ）
//   enabledSites   : 対象SNS（sites.js の getActiveSite が参照）
(function () {
  "use strict";

  var K = window.Kansho;
  var status = document.getElementById("status");

  function show(msg, isErr) {
    status.textContent = msg;
    status.className = isErr ? "err" : "";
  }

  var saveTimer = null;
  function saved() {
    show("保存しました");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { show(""); }, 1200);
  }

  // チェックボックスの一覧を作る共通部品。
  //   items    : [{ id, title, badge? }]
  //   enabled  : 初期選択の id 配列
  //   storeKey : 保存する storage キー
  //   emptyMsg : 全解除しようとしたときの警告
  function buildList(listEl, items, enabled, storeKey, emptyMsg) {
    function selectedIds() {
      return items.map(function (it) { return it.id; }).filter(function (id) {
        return listEl.querySelector('input[data-id="' + id + '"]').checked;
      });
    }
    function onChange(ev) {
      var sel = selectedIds();
      if (!sel.length) {
        ev.target.checked = true; // 全解除は許さない
        show(emptyMsg, true);
        return;
      }
      var obj = {};
      obj[storeKey] = sel;
      chrome.storage.sync.set(obj, saved);
    }
    items.forEach(function (it) {
      var label = document.createElement("label");
      label.className = "quiz";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-id", it.id);
      cb.checked = enabled.indexOf(it.id) !== -1;
      cb.addEventListener("change", onChange);
      label.appendChild(cb);
      if (it.badge) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = it.badge;
        label.appendChild(badge);
      }
      var name = document.createElement("span");
      name.textContent = it.title || it.id;
      label.appendChild(name);
      listEl.appendChild(label);
    });
  }

  chrome.storage.sync.get({ enabledQuizzes: null, enabledSites: null }, function (items) {
    // 出題プラグイン
    var quizIds = Object.keys(K.quizzes);
    var quizzes = quizIds.map(function (id) {
      return { id: id, title: K.quizzes[id].title, badge: K.quizzes[id].badge };
    });
    var enabledQuizzes = items.enabledQuizzes;
    if (!enabledQuizzes || !enabledQuizzes.length) {
      // 未設定なら従来の既定（config.activeQuiz）を初期選択として表示する
      enabledQuizzes = (K.config.activeQuiz && K.quizzes[K.config.activeQuiz])
        ? [K.config.activeQuiz]
        : quizIds;
    }
    buildList(document.getElementById("quizList"), quizzes, enabledQuizzes,
      "enabledQuizzes", "出題プラグインは最低1つ選んでください");

    // 対象SNS
    var siteIds = Object.keys(K.sites);
    var sites = siteIds.map(function (id) {
      return { id: id, title: K.sites[id].title };
    });
    var enabledSites = items.enabledSites;
    if (!enabledSites || !enabledSites.length) {
      enabledSites = ["youtube"]; // 未設定時の既定（sites.js と同じ）
    }
    buildList(document.getElementById("siteList"), sites, enabledSites,
      "enabledSites", "対象SNSは最低1つ選んでください");
  });
})();
