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
  // タイトル＋進捗ドット＋「問 i / n」を描画する。
  //   opts: { icon, title, total, index }
  // 「1ラウンド＝n問」という進捗の考え方は多くのクイズ形式で共通なので基盤に置く。
  // 各クイズは total / index を自分の意味で渡すだけでよい。
  function renderHeader(header, opts) {
    header.innerHTML = "";
    header.appendChild(el("div", "ytg-title",
      (opts.icon ? opts.icon + " " : "") + opts.title));

    var prog = el("div", "ytg-progress");
    for (var i = 0; i < opts.total; i++) {
      prog.appendChild(el("span", "ytg-dot" +
        (i < opts.index ? " done" : (i === opts.index ? " active" : ""))));
    }
    header.appendChild(prog);
    header.appendChild(el("div", "ytg-proglabel",
      "問 " + (opts.index + 1) + " / " + opts.total));
  }

  K.ui = {
    el: el,
    forbidCopy: forbidCopy,
    forbidPaste: forbidPaste,
    renderHeader: renderHeader
  };
})();
