// Kansho — 共有UIヘルパ（基盤層）。
// クイズ形式に依存しない描画部品だけを置く。各クイズは Kansho.ui.* を使う。
// CSSクラスは overlay.css の ytg-* を共通利用する。
(function () {
  "use strict";

  var K = window.Kansho || (window.Kansho = {});

  // ---- DOMヘルパ ---------------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---- コピー・ペースト等の禁止 ------------------------------------------
  // 自制のためのツールなので完全な回避防止は目的としない（README参照）。
  function block(ev) { ev.preventDefault(); ev.stopPropagation(); return false; }
  function forbidCopy(node) {
    ["copy", "cut", "contextmenu", "dragstart", "selectstart"].forEach(function (t) {
      node.addEventListener(t, block);
    });
  }
  function forbidPaste(node) {
    ["paste", "copy", "cut", "contextmenu", "drop", "dragover"].forEach(function (t) {
      node.addEventListener(t, block);
    });
  }

  // ---- 進捗ヘッダ --------------------------------------------------------
  // 判子バッジ（漢字一字）＋タイトル＋スタンプ進捗を描画する。
  //   opts: { badge, title, total, index }
  // スタンプは 済=✓（塗り）/ 現在=番号（アクセント枠）/ 未着手=番号（薄枠）。
  // 「1ラウンド＝n問」という進捗の考え方は多くのクイズ形式で共通なので基盤に置く。
  // 各クイズは total / index を自分の意味で渡すだけでよい。
  function renderHeader(header, opts) {
    header.innerHTML = "";
    header.appendChild(el("span", "ytg-badge", opts.badge || ""));
    header.appendChild(el("div", "ytg-title", opts.title));

    var stamps = el("div", "ytg-stamps");
    for (var i = 0; i < opts.total; i++) {
      var done = i < opts.index;
      stamps.appendChild(el("span", "ytg-st" +
        (done ? " done" : (i === opts.index ? " now" : "")),
        done ? "✓" : String(i + 1)));
    }
    header.appendChild(stamps);
  }

  K.ui = {
    el: el,
    forbidCopy: forbidCopy,
    forbidPaste: forbidPaste,
    renderHeader: renderHeader
  };
})();
