// 書き取りクイズ（古典文学）— 出題ロジック。
//
// 基盤層（Kansho）へ registerQuiz で登録する。基盤側はこのファイルの中身を
// 知らずに start(container, ctx) を呼ぶだけ。採点（正規化・diff）はこの形式
// 固有のドメインロジックなので、ここに閉じている。
//   ctx.onComplete : 全問クリア時に基盤が渡すコールバック（クリア後画面を描画）
//   ctx.options    : { passage } — 出題する作品を固定したい場合（省略時ランダム）
(function () {
  "use strict";

  var K = window.Kansho;
  var ui = K.ui;
  var el = ui.el;

  var ICON = "📜";
  var TITLE = "書き取り関所";

  // ---- 文字の正規化 ------------------------------------------------------
  // 1文字を比較用に正規化する。句読点・記号・空白は "" になる（＝比較で無視）。
  // 全角/半角(NFKC)・英字の大小も吸収する。
  function normChar(c) {
    var s = c;
    if (s.normalize) s = s.normalize("NFKC");
    s = s.toLowerCase();
    if (/\s/.test(s)) return "";
    try {
      s = s.replace(/[\p{P}\p{S}]/gu, "");
    } catch (e) {
      s = s.replace(/[、。，．,.・!?！？；;：:「」『』（）()"'’‘“”\-—…]/g, "");
    }
    return s;
  }

  // 文字列全体を正規化（等価判定用）。
  function normalize(s) {
    s = String(s);
    var out = "";
    for (var i = 0; i < s.length; i++) out += normChar(s[i]);
    return out;
  }

  function isCorrect(expected, input) {
    return normalize(expected) === normalize(input);
  }

  // 元文字列を「正規化文字の並び」と「各正規化文字が元の何文字目由来か」に分解する。
  function buildNorm(orig) {
    var norm = [], map = [];
    for (var i = 0; i < orig.length; i++) {
      var nc = normChar(orig[i]);
      for (var k = 0; k < nc.length; k++) { norm.push(nc[k]); map.push(i); }
    }
    return { norm: norm, map: map, orig: orig };
  }

  // ---- diff（正規化空間でアラインメントし、元の文字で描画する） ----------
  // 返り値: [{type:'eq'|'del'|'ins', ch}]（ch は元の文字＝スペース・句読点・大小もそのまま）
  //   del = 正解にあるのに入力に無い（抜け） / ins = 入力にあるのに正解に無い（余分・誤り）
  // 句読点・空白・大小の違いは正規化で無視されるため、誤りとして色付けされない。
  function alignedDiff(expected, input) {
    var E = buildNorm(expected), U = buildNorm(input);
    var e = E.norm, u = U.norm, n = e.length, m = u.length;

    // LCS の後方DP
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = e[i] === u[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    var out = [], expPos = 0, inpPos = 0, p = 0, q = 0;

    // 期待側の元文字を origIdx まで出力（途中の無視文字＝句読点/空白は eq 扱い）。
    function emitExp(origIdx, type) {
      for (var i = expPos; i < origIdx; i++) out.push({ type: "eq", ch: E.orig[i] });
      out.push({ type: type, ch: E.orig[origIdx] });
      expPos = origIdx + 1;
    }
    // 入力側の元文字を origIdx まで ins として出力（誤って多く打った箇所）。
    function emitIns(origIdx) {
      for (var i = inpPos; i <= origIdx; i++) out.push({ type: "ins", ch: U.orig[i] });
      inpPos = origIdx + 1;
    }

    while (p < n && q < m) {
      if (e[p] === u[q]) { emitExp(E.map[p], "eq"); inpPos = U.map[q] + 1; p++; q++; }
      else if (dp[p + 1][q] >= dp[p][q + 1]) { emitExp(E.map[p], "del"); p++; }
      else { emitIns(U.map[q]); q++; }
    }
    while (p < n) { emitExp(E.map[p], "del"); p++; }
    while (q < m) { emitIns(U.map[q]); q++; }
    // 末尾の無視文字（句読点など）を出力。
    for (var i = expPos; i < E.orig.length; i++) out.push({ type: "eq", ch: E.orig[i] });
    return out;
  }

  // ---- 1ラウンド（passage.segments の数だけ出題）の構築 ------------------
  function start(container, ctx) {
    ctx = ctx || {};
    var opts = ctx.options || {};
    var passages = K.data.dictationPassages || [];
    var passage = opts.passage ||
      passages[Math.floor(Math.random() * passages.length)];
    var state = { index: 0 };

    container.innerHTML = "";
    var header = el("div", "ytg-header");
    var body = el("div", "ytg-body");
    container.appendChild(header);
    container.appendChild(body);

    function renderHeader() {
      ui.renderHeader(header, {
        icon: ICON, title: TITLE,
        total: passage.segments.length, index: state.index
      });
    }

    // 作品タイトルの署名（表示欄・入力欄の両方の下に出す）。
    function buildCite() {
      var cite = el("div", "ytg-cite");
      cite.appendChild(el("span", "ytg-cite-title", "『" + passage.title + "』"));
      cite.appendChild(el("span", "ytg-cite-author", passage.author));
      return cite;
    }

    // 覚える画面
    function showDisplay() {
      renderHeader();
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-hint", "次の文章を覚えてください（コピー不可）"));

      var textBox = el("div", "ytg-text ytg-noselect");
      textBox.textContent = passage.segments[state.index];
      ui.forbidCopy(textBox);
      body.appendChild(textBox);

      body.appendChild(buildCite());

      var btn = el("button", "ytg-btn ytg-btn-primary", "覚えた");
      btn.addEventListener("click", showInput);
      body.appendChild(btn);
    }

    // 入力画面
    function showInput() {
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-hint",
        "覚えた文章を入力してください（貼り付け不可 / Ctrl+Enterで送信）"));
      var ta = el("textarea", "ytg-input");
      ta.setAttribute("autocomplete", "off");
      ta.setAttribute("autocorrect", "off");
      ta.setAttribute("autocapitalize", "off");
      ta.setAttribute("spellcheck", "false");
      ta.rows = 4;
      ta.placeholder = "ここに入力…";
      ui.forbidPaste(ta);
      ta.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          check(ta.value);
        }
      });
      body.appendChild(ta);

      body.appendChild(buildCite());

      var row = el("div", "ytg-btnrow");
      var submit = el("button", "ytg-btn ytg-btn-primary", "Submit");
      submit.addEventListener("click", function () { check(ta.value); });
      var reread = el("button", "ytg-btn ytg-btn-ghost", "もう一度見る");
      reread.addEventListener("click", showDisplay);
      row.appendChild(submit);
      row.appendChild(reread);
      body.appendChild(row);
      ta.focus();
    }

    // 答え合わせ
    function check(input) {
      var expected = passage.segments[state.index];
      if (isCorrect(expected, input)) {
        // 正解時は何も讃えず、淡々と次へ。
        state.index++;
        if (state.index >= passage.segments.length) complete();
        else showDisplay();
      } else {
        showDiff(expected, input);
      }
    }

    // 不正解 → diff表示 → やり直す
    function showDiff(expected, input) {
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-result ytg-ng", "間違いがあります"));

      var diff = alignedDiff(expected, input);
      var view = el("div", "ytg-diff");
      diff.forEach(function (d) {
        view.appendChild(el("span", "ytg-" + d.type, d.ch));
      });
      body.appendChild(view);

      var legend = el("div", "ytg-legend");
      legend.appendChild(el("span", "ytg-eq", "■"));  legend.appendChild(document.createTextNode(" 正しい　"));
      legend.appendChild(el("span", "ytg-ins", "■")); legend.appendChild(document.createTextNode(" 余分・誤り　"));
      legend.appendChild(el("span", "ytg-del", "■")); legend.appendChild(document.createTextNode(" 抜け"));
      body.appendChild(legend);

      var btn = el("button", "ytg-btn ytg-btn-primary", "やり直す");
      btn.addEventListener("click", showDisplay);
      body.appendChild(btn);
    }

    // 全問終了 → 基盤側（ctx.onComplete）に委譲
    function complete() {
      renderHeader();
      body.innerHTML = "";
      if (typeof ctx.onComplete === "function") {
        ctx.onComplete({
          container: container,
          body: body,
          ui: ui,
          el: el,
          restart: function (passageOverride) {
            start(container, Object.assign({}, ctx, {
              options: Object.assign({}, opts, { passage: passageOverride || null })
            }));
          }
        });
      }
    }

    showDisplay();
  }

  // ---- 基盤へ登録 --------------------------------------------------------
  K.registerQuiz({
    id: "dictation",
    title: TITLE,
    icon: ICON,
    start: start,
    // 採点ユーティリティを外から使いたい場合のために公開（任意）。
    util: { normalize: normalize, isCorrect: isCorrect }
  });
})();
