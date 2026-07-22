// ソルフェージュ: 重音聴音（2音）— 出題ロジック。
//
// 同時に鳴る2つの音を聴き取り、ピアノ鍵盤の○で2音を選んで答える。
//   - 出題: 下の音をランダムに選び、度数（短2度〜完全8度）をランダムに重ねる
//   - 音源: 音声ファイル不要。Web Audio API で基音＋倍音を合成して鳴らす
//   - 入力: 鍵盤クリック＝試し弾き（音が鳴るだけ）/ 鍵盤下の○＝解答の選択
//
// 将来、リズム聴音・旋律聴音は別フォルダ（quizzes/rhythm/ 等）の
// 別クイズとして追加する想定。
//
// 基盤層（Kansho）へ registerQuiz で登録する。プラグインとして自己完結し、
// 他のクイズには依存しない。
//   ctx.onComplete : 全問クリア時に基盤が渡すコールバック（クリア後画面を描画）
//   ctx.options    : { questions } — 出題を固定したい場合（省略時ランダム）
(function () {
  "use strict";

  var K = window.Kansho;
  var ui = K.ui;
  var el = ui.el;

  var BADGE = "重";
  var TITLE = "重音(2音)";
  var QUESTIONS_PER_ROUND = 3;

  // 鍵盤の音域（MIDIノート番号）: C4(60)〜C6(84)
  var KEY_LOW = 60, KEY_HIGH = 84;
  // 下の音の範囲: C4〜C5。完全8度を重ねても C6 に収まる。
  var BOTTOM_LOW = 60, BOTTOM_HIGH = 72;

  // 出題する度数（半音数と名前）
  var INTERVALS = [
    { st: 1,  name: "短2度" },
    { st: 2,  name: "長2度" },
    { st: 3,  name: "短3度" },
    { st: 4,  name: "長3度" },
    { st: 5,  name: "完全4度" },
    { st: 6,  name: "増4度" },
    { st: 7,  name: "完全5度" },
    { st: 8,  name: "短6度" },
    { st: 9,  name: "長6度" },
    { st: 10, name: "短7度" },
    { st: 11, name: "長7度" },
    { st: 12, name: "完全8度" }
  ];

  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var BLACK_PC = { 1: true, 3: true, 6: true, 8: true, 10: true };

  function noteName(midi) {
    return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  // ---- 音の合成（Web Audio API・音声ファイル不要） ------------------------
  var actx = null;
  function audioCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // 1音を鳴らす。基音＋倍音（減衰付き）の簡易ピアノ風。
  function playNote(midi, dur) {
    var ctx = audioCtx();
    var t = ctx.currentTime;
    var freq = midiToFreq(midi);
    // [倍音次数, 相対音量]
    [[1, 0.5], [2, 0.14], [3, 0.05]].forEach(function (h) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * h[0];
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(h[1] * 0.35, t + 0.015); // アタック
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);        // 減衰
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }

  function playChord(midis, dur) {
    midis.forEach(function (m) { playNote(m, dur); });
  }

  // ---- 出題の生成 ----------------------------------------------------------
  function makeQuestion() {
    var bottom = BOTTOM_LOW + Math.floor(Math.random() * (BOTTOM_HIGH - BOTTOM_LOW + 1));
    var iv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    return { bottom: bottom, top: bottom + iv.st, interval: iv };
  }
  function makeQuestions(count) {
    var qs = [];
    for (var i = 0; i < count; i++) qs.push(makeQuestion());
    return qs;
  }

  // ---- 鍵盤の描画 ----------------------------------------------------------
  // opts:
  //   selected : 選択中の MIDI 番号の配列（○の状態と同期）
  //   onToggle : ○クリック時のコールバック（省略時は○を出さない＝表示専用）
  //   marks    : { midi: "ok"|"ng" } — 答え合わせ結果の色付け（省略可）
  // 鍵盤クリックは常に試し弾き（音が鳴るだけで選択は変わらない）。
  function buildKeyboard(opts) {
    var kbd = el("div", "ju-kbd");
    var whiteCount = 0;
    for (var m = KEY_LOW; m <= KEY_HIGH; m++) {
      if (!BLACK_PC[m % 12]) whiteCount++;
    }
    var whiteW = 100 / whiteCount;

    var w = 0;
    for (var m = KEY_LOW; m <= KEY_HIGH; m++) {
      var isBlack = !!BLACK_PC[m % 12];
      var key = el("div", "ju-key " + (isBlack ? "ju-black" : "ju-white"));
      key.title = noteName(m);
      key.setAttribute("data-midi", m);
      if (isBlack) {
        var bw = whiteW * 0.62;
        key.style.left = (w * whiteW - bw / 2) + "%";
        key.style.width = bw + "%";
      } else {
        key.style.left = (w * whiteW) + "%";
        key.style.width = whiteW + "%";
        w++;
      }
      if (m % 12 === 0) { // C にだけ音名ラベルを出す（位置の目印）
        key.appendChild(el("span", "ju-keylabel", noteName(m)));
      }

      if (opts.marks && opts.marks[m]) key.classList.add("ju-" + opts.marks[m]);
      if (opts.selected && opts.selected.indexOf(m) !== -1) key.classList.add("ju-sel");

      // 試し弾き（クリックで音が鳴るだけ。選択は○で行う）
      (function (midi) {
        key.addEventListener("click", function () { playNote(midi, 1.2); });
      })(m);

      // 解答の選択○
      if (opts.onToggle) {
        var dot = el("span", "ju-dot");
        (function (midi) {
          dot.addEventListener("click", function (ev) {
            ev.stopPropagation(); // 試し弾きさせない
            opts.onToggle(midi);
          });
        })(m);
        key.appendChild(dot);
      }

      kbd.appendChild(key);
    }
    return kbd;
  }

  // ---- 1ラウンド（QUESTIONS_PER_ROUND 問）の構築 ---------------------------
  function start(container, ctx) {
    ctx = ctx || {};
    var opts = ctx.options || {};
    var questions = (opts.questions && opts.questions.length)
      ? opts.questions
      : makeQuestions(QUESTIONS_PER_ROUND);
    var state = { index: 0 };

    container.innerHTML = "";
    var header = el("div", "ytg-header");
    var body = el("div", "ytg-body");
    container.appendChild(header);
    container.appendChild(body);

    function question() { return questions[state.index]; }
    function answerMidis() { return [question().bottom, question().top]; }

    function renderHeader() {
      ui.renderHeader(header, {
        badge: BADGE, title: TITLE,
        total: questions.length, index: state.index
      });
    }

    // ---- Ctrl+Enter で「現在画面の主ボタン」を押す（他クイズと同じ方式）
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

    // 出題画面
    //   prevCorrect: 直前の問題に正解して進んできた場合 true。
    //   鍵盤だけの画面は問題が変わっても見た目が同じで気づきにくいので、
    //   「正解」を明示してから次の出題に入る。
    function showQuestion(prevCorrect) {
      renderHeader();
      body.innerHTML = "";
      if (prevCorrect === true) {
        // しばらく見せてからフェードアウト（消えても行の高さは保ち、レイアウトを揺らさない）
        body.appendChild(el("div", "ytg-result ytg-ok ju-fadeout", "正解"));
      }
      body.appendChild(el("div", "ytg-hint",
        "同時に鳴る2つの音を聴き取り、鍵盤下の○で2音を選んでください"));

      var selected = [];

      var playRow = el("div", "ytg-btnrow");
      var play = el("button", "ytg-btn ytg-btn-primary", "出題を聴く");
      play.addEventListener("click", function () { playChord(answerMidis(), 2.2); });
      var playLow = el("button", "ytg-btn ytg-btn-ghost", "ヒント: 下の音だけ聴く");
      playLow.addEventListener("click", function () { playNote(question().bottom, 1.6); });
      playRow.appendChild(play);
      playRow.appendChild(playLow);
      body.appendChild(playRow);

      var status = el("div", "ju-status", "");

      // 選択の増減はクラスの付け替えで反映する（鍵盤は作り直さない）
      function toggle(midi) {
        var i = selected.indexOf(midi);
        if (i !== -1) selected.splice(i, 1);
        else if (selected.length < 2) selected.push(midi);
        else { status.textContent = "選べるのは2音までです（○をもう一度押すと外せます）"; return; }
        status.textContent = "";
        var keys = kbd.querySelectorAll(".ju-key");
        for (var k = 0; k < keys.length; k++) {
          var midiK = parseInt(keys[k].getAttribute("data-midi"), 10);
          keys[k].classList.toggle("ju-sel", selected.indexOf(midiK) !== -1);
        }
      }

      var kbd = buildKeyboard({ selected: selected, onToggle: toggle });
      body.appendChild(kbd);
      body.appendChild(status);

      var row = el("div", "ytg-btnrow");
      var submit = el("button", "ytg-btn ytg-btn-primary", "Submit");
      submit.addEventListener("click", function () { check(selected); });
      row.appendChild(submit);
      body.appendChild(row);

      setEnter(function () { check(selected); });
    }

    // 答え合わせ（2音とも一致で正解）
    function check(selected) {
      if (selected.length !== 2) {
        var s = body.querySelector(".ju-status");
        if (s) s.textContent = "2音選んでから送信してください";
        return;
      }
      var ans = answerMidis();
      var ok = selected.indexOf(ans[0]) !== -1 && selected.indexOf(ans[1]) !== -1;
      if (ok) {
        // 次の出題画面の冒頭に「正解」を表示して進む（最後の1問は完了画面が出る）。
        state.index++;
        if (state.index >= questions.length) complete();
        else showQuestion(true);
      } else {
        showWrong(selected);
      }
    }

    // 不正解 → 自分の選んだ音の正誤だけ色で示す（正解の音は明かさない）→ やり直す
    function showWrong(selected) {
      body.innerHTML = "";
      body.appendChild(el("div", "ytg-result ytg-ng", "間違いがあります"));

      var ans = answerMidis();
      var marks = {};
      selected.forEach(function (m) {
        marks[m] = (ans.indexOf(m) !== -1) ? "ok" : "ng";
      });
      body.appendChild(buildKeyboard({ marks: marks }));

      var legend = el("div", "ytg-legend");
      legend.appendChild(el("span", "ju-legend-ok", "■"));
      legend.appendChild(document.createTextNode(" 合っていた音　"));
      legend.appendChild(el("span", "ju-legend-ng", "■"));
      legend.appendChild(document.createTextNode(" 違う音"));
      body.appendChild(legend);

      var row = el("div", "ytg-btnrow");
      var replay = el("button", "ytg-btn ytg-btn-ghost", "もう一度聴く");
      replay.addEventListener("click", function () { playChord(ans, 2.2); });
      var retry = el("button", "ytg-btn ytg-btn-primary", "やり直す");
      retry.addEventListener("click", showQuestion);
      row.appendChild(retry);
      row.appendChild(replay);
      body.appendChild(row);

      setEnter(showQuestion);
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
          restart: function (questionsOverride) {
            start(container, Object.assign({}, ctx, {
              options: Object.assign({}, opts, { questions: questionsOverride || null })
            }));
          }
        });
      }
    }

    showQuestion();
  }

  // ---- 基盤へ登録 ----------------------------------------------------------
  K.registerQuiz({
    id: "juon",
    title: TITLE,
    badge: BADGE,
    start: start,
    // テスト用に出題生成と音名変換を公開（任意）。
    util: { makeQuestion: makeQuestion, noteName: noteName, midiToFreq: midiToFreq }
  });
})();
