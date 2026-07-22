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

  var BADGE = "古";
  var TITLE = "古典文学";
  var ARMING_MS = 5000; // 「覚えた」が押せるようになるまでの待機（円形ゲージが満ちる時間）

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

  // ---- ルビ（青空文庫風「漢字《かな》」「｜語《かな》」記法） --------------
  // ルビは直前の漢字連続部分（｜があればそこから）に振られる。
  // 表示は <ruby>本文<rt>かな</rt></ruby>。採点ではルビ箇所を
  // 本文（漢字）・よみ（かな）のどちらで書いても正解とする。
  var RUBY_RE = /(?:｜([^《｜]+)|([々一-鿿々〆ヵヶ]+))《([^》]+)》/g;

  // ルビ記法をトークン列に分解する（採点用）。
  // 地の文 → { alts: [文字列] }、ルビ箇所 → { alts: [本文, よみ] }。
  // ルビ箇所は本文（漢字）とよみ（かな）のどちらで入力しても正解になる。
  function tokenizeRuby(text) {
    text = String(text);
    var tokens = [], last = 0, m;
    RUBY_RE.lastIndex = 0;
    while ((m = RUBY_RE.exec(text))) {
      if (m.index > last) {
        tokens.push({ alts: [text.slice(last, m.index).replace(/｜/g, "")] });
      }
      tokens.push({ alts: [m[1] || m[2], m[3]] });
      last = RUBY_RE.lastIndex;
    }
    if (last < text.length) {
      tokens.push({ alts: [text.slice(last).replace(/｜/g, "")] });
    }
    return tokens;
  }

  // 入力がトークン列と一致するか（各ルビ箇所は漢字/かなのどちらでも可）。
  // 正規化空間で「到達しうる入力位置」の集合を前から伝播させて判定する。
  function matchesAny(tokens, input) {
    var u = normalize(input);
    var pos = [0];
    for (var t = 0; t < tokens.length; t++) {
      var alts = tokens[t].alts, seen = {}, next = [];
      for (var v = 0; v < alts.length; v++) {
        var e = normalize(alts[v]);
        for (var i = 0; i < pos.length; i++) {
          var q = pos[i] + e.length;
          if (!seen[q] && u.substr(pos[i], e.length) === e) {
            seen[q] = true;
            next.push(q);
          }
        }
      }
      if (!next.length) return false;
      pos = next;
    }
    return pos.indexOf(u.length) !== -1;
  }

  // 不正解時の diff 用に、入力の表記に最も近い解釈（各ルビ箇所で漢字/かなの
  // どちらを使ったか）を選び、具体的な期待文字列を組み立てる。
  // トークン境界ごとに LCS を DP で伝播させ、末尾から選択を巻き戻す。
  // 同点なら本文（漢字）を優先（丸ごと抜けた箇所は原文の漢字で表示される）。
  function chooseExpected(tokens, input) {
    var u = normalize(input), m = u.length, T = tokens.length;
    var f = new Int32Array(m + 1); // f[j] = 消費済みトークン列と入力先頭j文字の最大LCS
    var choices = [];
    for (var b = 0; b < T; b++) {
      var alts = tokens[b].alts;
      var fNext = new Int32Array(m + 1), vSel = new Uint8Array(m + 1),
          backSel = new Int32Array(m + 1), first = true;
      for (var v = 0; v < alts.length; v++) {
        var e = normalize(alts[v]), len = e.length;
        // g[j] = このトークンを途中まで消費した状態のLCS / p[j] = トークン開始時の入力位置
        var g = f, p = new Int32Array(m + 1);
        for (var j = 0; j <= m; j++) p[j] = j;
        for (var c = 1; c <= len; c++) {
          var g2 = new Int32Array(m + 1), p2 = new Int32Array(m + 1);
          g2[0] = g[0]; p2[0] = p[0];
          for (var j = 1; j <= m; j++) {
            var s = g[j], sp = p[j];                                // 期待側の文字を落とす
            if (g2[j - 1] > s) { s = g2[j - 1]; sp = p2[j - 1]; }   // 入力側の文字を落とす
            if (e[c - 1] === u[j - 1] && g[j - 1] + 1 >= s) {       // 一致（同点なら一致を優先）
              s = g[j - 1] + 1; sp = p[j - 1];
            }
            g2[j] = s; p2[j] = sp;
          }
          g = g2; p = p2;
        }
        for (var j = 0; j <= m; j++) {
          if (first || g[j] > fNext[j]) { fNext[j] = g[j]; vSel[j] = v; backSel[j] = p[j]; }
        }
        first = false;
      }
      f = fNext;
      choices.push({ v: vSel, back: backSel });
    }
    // 末尾から各トークンの選択を回収して連結
    var parts = new Array(T), j = m;
    for (var b = T - 1; b >= 0; b--) {
      parts[b] = tokens[b].alts[choices[b].v[j]];
      j = choices[b].back[j];
    }
    return parts.join("");
  }

  // ルビ記法をふりがな付きDOMとして node に描画する（表示用）
  function renderRuby(node, text) {
    text = String(text);
    var last = 0, m;
    RUBY_RE.lastIndex = 0;
    while ((m = RUBY_RE.exec(text))) {
      if (m.index > last) {
        node.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      var ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(m[1] || m[2]));
      var rt = document.createElement("rt");
      rt.textContent = m[3];
      ruby.appendChild(rt);
      node.appendChild(ruby);
      last = RUBY_RE.lastIndex;
    }
    if (last < text.length) {
      node.appendChild(document.createTextNode(text.slice(last)));
    }
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
    var passages = K.data.kotenPassages || [];
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
        badge: BADGE, title: TITLE,
        total: passage.segments.length, index: state.index
      });
    }

    // 作品タイトルの署名（表示欄・入力欄の両方の下に出す）。
    function buildCite() {
      var cite = el("div", "ytg-cite");
      cite.appendChild(el("span", "ytg-cite-title", passage.title));
      cite.appendChild(el("span", "ytg-cite-author", passage.author));
      return cite;
    }

    // ---- Ctrl+Enter で「現在画面の主ボタン」を押す ------------------------
    // 各画面が setEnter(fn) で動作を差し替える。リスナは document に1つだけ張り、
    // フォーカス位置に依存せず拾う。container 撤去後は自動失効、再スタート時は張り替え。
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

    // 覚える画面
    function showDisplay() {
      renderHeader();
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-hint", "次の文章を覚えてください"));

      var textBox = el("div", "ytg-text ytg-noselect");
      renderRuby(textBox, passage.segments[state.index]);
      ui.forbidCopy(textBox);
      body.appendChild(textBox);

      body.appendChild(buildCite());

      // 「覚えた」は表示から ARMING_MS の間は押せない。
      // ボタンが左から右へ金色に満ちきると解除（transform で軽く滑らかに）。
      var btn = el("button", "ytg-btn ytg-btn-primary ytg-btn-arming", "");
      btn.disabled = true;
      var fill = el("span", "ytg-fill");
      fill.style.animationDuration = (ARMING_MS / 1000) + "s";
      btn.appendChild(fill);
      btn.appendChild(el("span", "ytg-arm-label", "覚えた"));
      btn.addEventListener("click", showInput);
      body.appendChild(btn);

      // Ctrl+Enter でも押せる（ただし待機解除後のみ）。
      setEnter(function () { if (!btn.disabled) showInput(); });

      // 解除はゲージが実際に満ちた瞬間（animationend）に行う。
      // setTimeout だと重いページでアニメ開始が遅れ、終端で一気に進んで見えるため。
      var armed = false;
      function disarm() {
        if (armed || !btn.isConnected) return; // 二重発火・画面切替後を無視
        armed = true;
        btn.disabled = false;
        btn.classList.remove("ytg-btn-arming");
        btn.textContent = "覚えた"; // 充填要素を消して通常表示へ
      }
      fill.addEventListener("animationend", disarm);
      // アニメが走らない環境向けフォールバック（余裕を持たせる）。
      setTimeout(disarm, ARMING_MS + 1500);
    }

    // 入力画面
    function showInput() {
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-hint",
        "覚えた文章を入力してください"));

      // ヒント: ぼかした原文（濃淡＝漢字かどうかが分かる程度）。初期は非表示。
      // ボタンを押すたびに表示→1pxずつ薄くなる（最低 BLUR_MIN px）。
      // 押した後は5秒のクールダウンで無効化され、経過すると再び押せる。
      var hintBox = el("div", "ytg-text ytg-noselect ytg-blur");
      renderRuby(hintBox, passage.segments[state.index]);
      ui.forbidCopy(hintBox);
      hintBox.style.display = "none";
      body.appendChild(hintBox);

      var BLUR_START = 6, BLUR_MIN = 3, HINT_COOLDOWN_MS = 5000;
      var blurPx = BLUR_START;
      var hintShown = false;
      function applyBlur() { hintBox.style.filter = "blur(" + blurPx + "px)"; }

      var ta = el("textarea", "ytg-input");
      ta.setAttribute("autocomplete", "off");
      ta.setAttribute("autocorrect", "off");
      ta.setAttribute("autocapitalize", "off");
      ta.setAttribute("spellcheck", "false");
      ta.rows = 4;
      ta.placeholder = "ここに入力…";
      ui.forbidPaste(ta);
      body.appendChild(ta);

      body.appendChild(buildCite());

      var row = el("div", "ytg-btnrow");
      var submit = el("button", "ytg-btn ytg-btn-primary", "Submit");
      submit.addEventListener("click", function () { check(ta.value); });
      var hint = el("button", "ytg-btn ytg-btn-ghost", "ヒント");
      hint.addEventListener("click", function () {
        if (!hintShown) {
          hintShown = true;
          hintBox.style.display = "";
          applyBlur();
        } else if (blurPx > BLUR_MIN) {
          blurPx--;
          applyBlur();
        }
        if (blurPx <= BLUR_MIN) {
          hint.disabled = true; // これ以上薄くならない
          hint.textContent = "ヒントを薄く";
          return;
        }
        hint.textContent = "ヒントを薄く";
        hint.disabled = true; // クールダウン: 5秒後に再び押せる
        setTimeout(function () {
          if (hint.isConnected && blurPx > BLUR_MIN) hint.disabled = false;
        }, HINT_COOLDOWN_MS);
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

    // 答え合わせ（ルビ箇所は漢字でもかなでも正解）
    function check(input) {
      var tokens = tokenizeRuby(passage.segments[state.index]);
      if (matchesAny(tokens, input)) {
        // 正解時は何も讃えず、淡々と次へ。
        state.index++;
        if (state.index >= passage.segments.length) complete();
        else showDisplay();
      } else {
        // diff は入力の表記（漢字/かな）に最も近い解釈の期待文字列と比べる。
        showDiff(chooseExpected(tokens, input), input);
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

      // Ctrl+Enter でも「やり直す」を押せる。
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
    id: "koten",
    title: TITLE,
    badge: BADGE,
    start: start,
    // 採点ユーティリティを外から使いたい場合のために公開（任意）。
    util: {
      normalize: normalize, isCorrect: isCorrect,
      tokenizeRuby: tokenizeRuby, matchesAny: matchesAny, chooseExpected: chooseExpected
    }
  });
})();
