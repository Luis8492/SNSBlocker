// 百人一首書き取りクイズ — 出題ロジック。
//
// 書き取り（dictation）と同系だが、
//   - 上の句は常に表示され、覚えて入力するのは下の句のみ
//   - 「覚えた」に待機時間（5秒ゲージ）は無い
// という点が異なる。1ラウンドは POEMS_PER_ROUND 首（重複なしランダム）。
//
// 基盤層（Kansho）へ registerQuiz で登録する。採点（正規化・diff）は
// この形式固有のドメインロジックなので、プラグインとして自己完結する
// ようここに閉じている（dictation には依存しない。フォーク運用で
// quizzes/dictation を消しても動く）。
//   ctx.onComplete : 全問クリア時に基盤が渡すコールバック（クリア後画面を描画）
//   ctx.options    : { poems } — 出題する首を固定したい場合（省略時ランダム）
(function () {
  "use strict";

  var K = window.Kansho;
  var ui = K.ui;
  var el = ui.el;

  var ICON = "🎴";
  var TITLE = "百人一首関所";
  var POEMS_PER_ROUND = 3; // 1ラウンドの出題数

  // ---- 文字の正規化（dictation と同仕様） --------------------------------
  // 句読点・記号・空白は "" になる（＝比較で無視）。
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

  function normalize(s) {
    s = String(s);
    var out = "";
    for (var i = 0; i < s.length; i++) out += normChar(s[i]);
    return out;
  }

  function isCorrect(expected, input) {
    return normalize(expected) === normalize(input);
  }

  function buildNorm(orig) {
    var norm = [], map = [];
    for (var i = 0; i < orig.length; i++) {
      var nc = normChar(orig[i]);
      for (var k = 0; k < nc.length; k++) { norm.push(nc[k]); map.push(i); }
    }
    return { norm: norm, map: map, orig: orig };
  }

  // ---- diff（正規化空間でアラインメントし、元の文字で描画する） ----------
  // 返り値: [{type:'eq'|'del'|'ins', ch}]
  //   del = 正解にあるのに入力に無い（抜け） / ins = 入力にあるのに正解に無い（余分・誤り）
  function alignedDiff(expected, input) {
    var E = buildNorm(expected), U = buildNorm(input);
    var e = E.norm, u = U.norm, n = e.length, m = u.length;

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

    function emitExp(origIdx, type) {
      for (var i = expPos; i < origIdx; i++) out.push({ type: "eq", ch: E.orig[i] });
      out.push({ type: type, ch: E.orig[origIdx] });
      expPos = origIdx + 1;
    }
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
    for (var i = expPos; i < E.orig.length; i++) out.push({ type: "eq", ch: E.orig[i] });
    return out;
  }

  // ---- 出題する首の選択（重複なしランダム） ------------------------------
  function pickPoems(all, count) {
    var pool = all.slice();
    var picked = [];
    while (picked.length < count && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  // ---- 1ラウンド（POEMS_PER_ROUND 首）の構築 ------------------------------
  function start(container, ctx) {
    ctx = ctx || {};
    var opts = ctx.options || {};
    var all = K.data.hyakuninPoems || [];
    var poems = (opts.poems && opts.poems.length)
      ? opts.poems
      : pickPoems(all, Math.min(POEMS_PER_ROUND, all.length));
    var state = { index: 0 };

    container.innerHTML = "";
    var header = el("div", "ytg-header");
    var body = el("div", "ytg-body");
    container.appendChild(header);
    container.appendChild(body);

    function poem() { return poems[state.index]; }

    function renderHeader() {
      ui.renderHeader(header, {
        icon: ICON, title: TITLE,
        total: poems.length, index: state.index
      });
    }

    // 歌番号と作者の署名（表示欄・入力欄の両方の下に出す）。
    function buildCite() {
      var cite = el("div", "ytg-cite");
      cite.appendChild(el("span", "ytg-cite-title", "第" + poem().no + "首"));
      cite.appendChild(el("span", "ytg-cite-author", poem().author));
      return cite;
    }

    // 上の句の表示欄（全画面で常に出す）。ラベル付き・コピー不可。
    function buildKami() {
      var wrap = el("div", "hy-kami-wrap");
      wrap.appendChild(el("div", "hy-label", "上の句"));
      var box = el("div", "ytg-text ytg-noselect hy-kami");
      box.textContent = poem().kami;
      ui.forbidCopy(box);
      wrap.appendChild(box);
      return wrap;
    }

    // ---- Ctrl+Enter で「現在画面の主ボタン」を押す（dictation と同じ方式）
    var enterAction = null;
    function setEnter(fn) { enterAction = fn; }
    function onKey(ev) {
      if (ev.key !== "Enter" || !(ev.ctrlKey || ev.metaKey)) return;
      if (!container.isConnected) {
        document.removeEventListener("keydown", onKey, true);
        return;
      }
      if (typeof enterAction === "function") {
        ev.preventDefault();
        ev.stopPropagation();
        enterAction();
      }
    }
    if (container._ytgKey) document.removeEventListener("keydown", container._ytgKey, true);
    container._ytgKey = onKey;
    document.addEventListener("keydown", onKey, true);

    // 覚える画面（下の句を覚える。「覚えた」は待機なしで即押せる）
    function showDisplay() {
      renderHeader();
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-hint", "下の句を覚えてください（コピー不可）"));

      body.appendChild(buildKami());

      var wrap = el("div", "hy-shimo-wrap");
      wrap.appendChild(el("div", "hy-label", "下の句"));
      var textBox = el("div", "ytg-text ytg-noselect hy-shimo");
      textBox.textContent = poem().shimo;
      ui.forbidCopy(textBox);
      wrap.appendChild(textBox);
      body.appendChild(wrap);

      body.appendChild(buildCite());

      var btn = el("button", "ytg-btn ytg-btn-primary", "覚えた");
      btn.addEventListener("click", showInput);
      body.appendChild(btn);

      setEnter(showInput);
    }

    // 入力画面（上の句は見えたまま、下の句を入力する）
    function showInput() {
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-hint",
        "下の句を入力してください（貼り付け不可 / Ctrl+Enterで送信）"));

      body.appendChild(buildKami());

      // ヒント: ぼかした下の句。初期は非表示。
      var hintBox = el("div", "ytg-text ytg-noselect ytg-blur hy-shimo");
      hintBox.textContent = poem().shimo;
      ui.forbidCopy(hintBox);
      hintBox.style.display = "none";
      body.appendChild(hintBox);

      var ta = el("textarea", "ytg-input");
      ta.setAttribute("autocomplete", "off");
      ta.setAttribute("autocorrect", "off");
      ta.setAttribute("autocapitalize", "off");
      ta.setAttribute("spellcheck", "false");
      ta.rows = 2;
      ta.placeholder = "下の句を入力…";
      ui.forbidPaste(ta);
      body.appendChild(ta);

      body.appendChild(buildCite());

      var row = el("div", "ytg-btnrow");
      var submit = el("button", "ytg-btn ytg-btn-primary", "Submit");
      submit.addEventListener("click", function () { check(ta.value); });
      var hint = el("button", "ytg-btn ytg-btn-ghost", "ヒント");
      hint.addEventListener("click", function () {
        var shown = hintBox.style.display !== "none";
        hintBox.style.display = shown ? "none" : "";
        hint.textContent = shown ? "ヒント" : "ヒントを隠す";
      });
      var reread = el("button", "ytg-btn ytg-btn-ghost", "もう一度見る");
      reread.addEventListener("click", showDisplay);
      row.appendChild(submit);
      row.appendChild(hint);
      row.appendChild(reread);
      body.appendChild(row);

      // Ctrl+Enter で送信（プレーンEnterは改行のまま）。
      setEnter(function () { check(ta.value); });
      ta.focus();
    }

    // 答え合わせ（下の句のみ判定）
    function check(input) {
      var expected = poem().shimo;
      if (isCorrect(expected, input)) {
        // 正解時は何も讃えず、淡々と次へ。
        state.index++;
        if (state.index >= poems.length) complete();
        else showDisplay();
      } else {
        showDiff(expected, input);
      }
    }

    // 不正解 → diff表示 → やり直す
    function showDiff(expected, input) {
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-result ytg-ng", "間違いがあります"));

      body.appendChild(buildKami());

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

      setEnter(showDisplay);
    }

    // 全問終了 → 基盤側（ctx.onComplete）に委譲
    function complete() {
      renderHeader();
      body.innerHTML = "";
      setEnter(null); // クリア後画面のボタンは Ctrl+Enter 対象外
      if (typeof ctx.onComplete === "function") {
        ctx.onComplete({
          container: container,
          body: body,
          ui: ui,
          el: el,
          restart: function (poemsOverride) {
            start(container, Object.assign({}, ctx, {
              options: Object.assign({}, opts, { poems: poemsOverride || null })
            }));
          }
        });
      }
    }

    showDisplay();
  }

  // ---- 基盤へ登録 --------------------------------------------------------
  K.registerQuiz({
    id: "hyakunin",
    title: TITLE,
    icon: ICON,
    start: start,
    util: { normalize: normalize, isCorrect: isCorrect }
  });
})();
