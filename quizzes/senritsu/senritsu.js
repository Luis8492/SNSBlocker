// 旋律聴音（4小節・両手）— 出題ロジック。
//
// ハ長調・4/4・4小節の「左手=分散和音＋右手=メロディ」を自動生成して再生し、
// 大譜表（ト音＋ヘ音）に両手とも書き取らせる。
//   - 生成: 小節ごとに I/IV/V からランダムに和音を選び（進行・終止の制約なし。
//     聴音の練習が目的でありよい曲を作るのが目的ではない）、左手はその分散和音
//     （4分で root-5th-3rd-5th）。右手は音階内（ハ長調ダイアトニック）・
//     音域 C4〜C6 で、2拍ごとに「2分×1 か 4分×2」のリズムをとるランダムウォーク。
//     休符なし。音価は2分と4分のみ（8分は使わない）。
//   - 音源: 音声ファイル不要。Web Audio API で合成（juon と同方式・自己完結）。
//   - 入力: 音価（2分/4分）を選ぶと、譜面上のマウス位置に「置かれる予定の音符」が
//     縦位置スナップ済みのゴーストとして表示され、クリックで確定する。
//     上段クリック=右手、下段クリック=左手。横位置は自動で左から詰まる。
//   - 再生は無制限。「入力を聴く」で自分の答えも再生できる。
//   - 採点: 両手とも、発音タイミング・音高・音価がすべて一致で正解。不正解時は
//     自分の音符の正誤だけを色で示す（正解は明かさない）。入力は保持され修正できる。
//
// 基盤層（Kansho）へ registerQuiz で登録する。プラグインとして自己完結。
//   ctx.onComplete : 全問クリア時に基盤が渡すコールバック
//   ctx.options    : { questions } — 出題を固定したい場合（省略時ランダム）
(function () {
  "use strict";

  var K = window.Kansho;
  var ui = K.ui;
  var el = ui.el;

  var BADGE = "旋";
  var TITLE = "旋律聴音";
  var QUESTIONS_PER_ROUND = 3;

  var BARS = 4;
  var BEATS_PER_BAR = 4;
  var TOTAL_BEATS = BARS * BEATS_PER_BAR;
  var BEAT_SEC = 60 / 84; // テンポ ♩=84

  // ---- 音階（ハ長調ダイアトニック） ---------------------------------------
  // deg: 0=C4 を基準に上下へ（7=C5, -7=C3）。負の deg は左手（ヘ音記号）側。
  var SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
  function degToMidi(deg) {
    var pc = ((deg % 7) + 7) % 7;
    return 60 + SCALE_SEMITONES[pc] + 12 * Math.floor(deg / 7);
  }

  // 右手（メロディ）の音域: C4〜C6
  var RH_MIN = 0, RH_MAX = 14;

  // 左手の分散和音（I/IV/V。root-5th-3rd-5th を4分で刻む）。deg 表記。
  var CHORDS = {
    I:  [-7, -3, -5, -3], // C3 G3 E3 G3
    IV: [-4,  0, -2,  0], // F3 C4 A3 C4
    V:  [-3,  1, -1,  1]  // G3 D4 B3 D4
  };
  var CHORD_NAMES = ["I", "IV", "V"];

  // ---- 音の合成（Web Audio API・juon と同方式の自己完結コピー） ------------
  var actx = null;
  function audioCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // 再生中のオシレーターを控えておき、「停止」で全部止められるようにする
  var activeOscs = [];
  function stopAll() {
    activeOscs.forEach(function (osc) {
      try { osc.stop(0); } catch (e) {}
    });
    activeOscs = [];
  }

  // when 秒後に midi を dur 秒鳴らす（vol は相対音量）
  function playNote(midi, dur, when, vol) {
    var ctx = audioCtx();
    var t = ctx.currentTime + (when || 0);
    var freq = midiToFreq(midi);
    [[1, 0.5], [2, 0.14], [3, 0.05]].forEach(function (h) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * h[0];
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(h[1] * 0.35 * (vol || 1), t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      activeOscs.push(osc);
    });
  }

  // カウントインのクリック音（短い高音。1拍目だけ少し高く強く）
  function playClick(when, accent) {
    var ctx = audioCtx();
    var t = ctx.currentTime + when;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(accent ? 0.12 : 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
    activeOscs.push(osc);
  }

  // ---- 出題の生成 ----------------------------------------------------------
  // 返り値: { rh: [{onset, deg, dur}], lh: [{onset, deg, dur}] }（dur は拍数）
  function makeQuestion() {
    // 左手: 小節ごとにランダムな和音の分散（4分×4）
    var lh = [];
    for (var b = 0; b < BARS; b++) {
      var chord = CHORDS[CHORD_NAMES[Math.floor(Math.random() * CHORD_NAMES.length)]];
      for (var i = 0; i < 4; i++) {
        lh.push({ onset: b * 4 + i, deg: chord[i], dur: 1 });
      }
    }
    // 右手: 2拍ごとに「2分×1」か「4分×2」。順次進行を基本にたまに跳躍。
    var rh = [];
    var deg = 4 + Math.floor(Math.random() * 7); // 中音域（G4〜F5あたり）から開始
    var onset = 0;
    while (onset < TOTAL_BEATS) {
      var durs = Math.random() < 0.5 ? [2] : [1, 1];
      for (var j = 0; j < durs.length; j++) {
        rh.push({ onset: onset, deg: deg, dur: durs[j] });
        onset += durs[j];
        var r = Math.random();
        var step = r < 0.7 ? (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() < 0.3 ? 1 : 0))
                          : Math.floor(Math.random() * 9) - 4;
        deg = Math.max(RH_MIN, Math.min(RH_MAX, deg + step));
      }
    }
    return { rh: rh, lh: lh };
  }
  function makeQuestions(count) {
    var qs = [];
    for (var i = 0; i < count; i++) qs.push(makeQuestion());
    return qs;
  }

  // ---- 再生 ----------------------------------------------------------------
  // countIn: true なら開始前に4拍のクリックを打ってから演奏する（出題用）。
  // 直前の再生は止めてから始める。
  function playHands(rh, lh, countIn) {
    stopAll();
    audioCtx(); // クリック起点で初期化
    var offset = 0;
    if (countIn) {
      for (var i = 0; i < BEATS_PER_BAR; i++) {
        playClick(i * BEAT_SEC, i === 0);
      }
      offset = BEATS_PER_BAR * BEAT_SEC;
    }
    rh.forEach(function (n) {
      playNote(degToMidi(n.deg), n.dur * BEAT_SEC * 0.95, offset + n.onset * BEAT_SEC, 1);
    });
    lh.forEach(function (n) {
      playNote(degToMidi(n.deg), n.dur * BEAT_SEC * 0.95, offset + n.onset * BEAT_SEC, 0.5);
    });
  }

  // ---- 大譜表（SVG） -------------------------------------------------------
  var SVG_NS = "http://www.w3.org/2000/svg";
  var VW = 660, VH = 250;
  var STAFF_LEFT = 50, STAFF_RIGHT = 642;
  var BAR_W = (STAFF_RIGHT - STAFF_LEFT) / BARS;
  var LINE_GAP = 10;
  var STEP = LINE_GAP / 2;

  // 上段=右手（ト音: 最下線 E4=deg2）/ 下段=左手（ヘ音: 最下線 G2=deg-10）
  var STAVES = {
    rh: { clef: "𝄞", bottomY: 95,  bottomDeg: 2,   min: RH_MIN, max: RH_MAX },
    lh: { clef: "𝄢", bottomY: 205, bottomDeg: -10, min: -11,    max: 2 }
  };
  // 上下段のクリック判定の境界（この y より上なら右手）
  var STAFF_SPLIT_Y = 130;

  function degY(st, deg) { return st.bottomY - (deg - st.bottomDeg) * STEP; }
  function noteX(onset) {
    var bar = Math.floor(onset / BEATS_PER_BAR);
    var beat = onset - bar * BEATS_PER_BAR;
    return STAFF_LEFT + bar * BAR_W + 16 + (beat / BEATS_PER_BAR) * (BAR_W - 28);
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function buildStaff() {
    var svg = svgEl("svg", { viewBox: "0 0 " + VW + " " + VH, "class": "se-staff" });
    ["rh", "lh"].forEach(function (hand) {
      var st = STAVES[hand];
      for (var i = 0; i < 5; i++) {
        var y = st.bottomY - i * LINE_GAP;
        svg.appendChild(svgEl("line", { x1: 20, y1: y, x2: STAFF_RIGHT, y2: y, "class": "se-line" }));
      }
      // 音部記号（テキストのベースライン位置は目視調整済み）
      var clef = svgEl("text", {
        x: 24,
        y: hand === "rh" ? st.bottomY - 2 : st.bottomY - 6,
        "class": hand === "rh" ? "se-clef" : "se-clef se-clef-f"
      });
      clef.textContent = st.clef;
      svg.appendChild(clef);
    });
    // 小節線（両段を貫く）
    var topY = STAVES.rh.bottomY - 4 * LINE_GAP;
    var botY = STAVES.lh.bottomY;
    for (var b = 0; b <= BARS; b++) {
      var x = b === 0 ? 20 : STAFF_LEFT + b * BAR_W;
      svg.appendChild(svgEl("line", {
        x1: x, y1: topY, x2: x, y2: botY,
        "class": "se-line" + (b === BARS ? " se-final" : "")
      }));
    }
    return svg;
  }

  // 音符1つを <g> として作る。dur 2=2分（白玉）/ 1=4分（黒玉）。
  function buildNote(st, onset, deg, dur, cls) {
    var g = svgEl("g", { "class": "se-note" + (cls ? " " + cls : "") });
    var x = noteX(onset), y = degY(st, deg);
    // 加線（譜の外の音。譜の最下線より下・最上線より上の「線」位置に引く）
    for (var L = st.bottomDeg - 2; L >= deg; L -= 2) {
      g.appendChild(svgEl("line", { x1: x - 9, y1: degY(st, L), x2: x + 9, y2: degY(st, L), "class": "se-ledger" }));
    }
    for (var L = st.bottomDeg + 10; L <= deg; L += 2) {
      g.appendChild(svgEl("line", { x1: x - 9, y1: degY(st, L), x2: x + 9, y2: degY(st, L), "class": "se-ledger" }));
    }
    // 符頭（2分は白玉）
    g.appendChild(svgEl("ellipse", {
      cx: x, cy: y, rx: 5.6, ry: 4.2,
      "class": "se-head" + (dur === 2 ? " se-head-half" : "")
    }));
    // 符幹（譜の中線以上は下向き）
    var up = deg < st.bottomDeg + 4;
    var sx = up ? x + 5.6 : x - 5.6;
    g.appendChild(svgEl("line", { x1: sx, y1: y, x2: sx, y2: up ? y - 30 : y + 30, "class": "se-stem" }));
    return g;
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

    function renderHeader() {
      ui.renderHeader(header, {
        badge: BADGE, title: TITLE,
        total: questions.length, index: state.index
      });
    }

    // ---- Ctrl+Enter（他クイズと同じ方式） ---------------------------------
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
    function showQuestion(prevCorrect) {
      stopAll(); // 前問の再生が残っていれば止める
      renderHeader();
      body.innerHTML = "";
      if (prevCorrect === true) {
        body.appendChild(el("div", "ytg-result ytg-ok se-fadeout", "正解"));
      }
      body.appendChild(el("div", "ytg-hint",
        "音価を選び、置きたいあたりでクリック / 右クリックで削除"));

      // 手ごとの入力状態。音符は好きな時間位置に置ける（横位置から拍にスナップ）。
      var input = { rh: [], lh: [] };
      var marks = null;      // { rh: [bool], lh: [bool] }（編集で消える）
      var palette = 1;       // 選択中の音価（2=2分, 1=4分）
      var seq = 0;           // 「一つ戻す」用の置いた順序

      function sumBeats(hand) {
        return input[hand].reduce(function (s, n) { return s + n.dur; }, 0);
      }

      // 「整列」: 各小節に属する音符（onset の小数位置で判定）を、
      // 小節内で左詰め・拍グリッドにスナップし直す。
      function alignNotes(notes) {
        var bars = [];
        for (var b = 0; b < BARS; b++) bars.push([]);
        notes.forEach(function (n) {
          var b = Math.max(0, Math.min(BARS - 1, Math.floor(n.onset / BEATS_PER_BAR)));
          bars[b].push(n);
        });
        bars.forEach(function (arr, b) {
          arr.sort(function (a, c) { return a.onset - c.onset; });
          var pos = b * BEATS_PER_BAR;
          arr.forEach(function (n) { n.onset = pos; pos += n.dur; });
        });
        notes.sort(function (a, c) { return a.onset - c.onset; });
      }
      function alignAll() {
        alignNotes(input.rh);
        alignNotes(input.lh);
      }

      var playRow = el("div", "ytg-btnrow");
      var play = el("button", "ytg-btn ytg-btn-primary", "出題を聴く");
      play.addEventListener("click", function () {
        playHands(question().rh, question().lh, true); // カウントイン4拍つき
      });
      var playIn = el("button", "ytg-btn ytg-btn-ghost", "入力を聴く");
      playIn.addEventListener("click", function () { playHands(input.rh, input.lh, false); });
      var stop = el("button", "ytg-btn ytg-btn-ghost", "停止");
      stop.addEventListener("click", stopAll);
      playRow.appendChild(play);
      playRow.appendChild(playIn);
      playRow.appendChild(stop);
      body.appendChild(playRow);

      // 音価パレット＋修正ボタン
      var toolRow = el("div", "ytg-btnrow se-tools");
      var q2 = el("button", "ytg-btn ytg-btn-ghost", "2分音符");
      var q4 = el("button", "ytg-btn ytg-btn-ghost se-active", "4分音符");
      q2.addEventListener("click", function () { palette = 2; q2.classList.add("se-active"); q4.classList.remove("se-active"); ghost(); });
      q4.addEventListener("click", function () { palette = 1; q4.classList.add("se-active"); q2.classList.remove("se-active"); ghost(); });
      var undo = el("button", "ytg-btn ytg-btn-ghost", "一つ戻す");
      undo.addEventListener("click", function () {
        // 最後に置いた音符（seq 最大）を消す
        var hand = null, idx = -1, best = -1;
        ["rh", "lh"].forEach(function (h) {
          input[h].forEach(function (n, i) {
            if (n.seq > best) { best = n.seq; hand = h; idx = i; }
          });
        });
        if (hand === null) return;
        input[hand].splice(idx, 1);
        marks = null;
        render();
      });
      var clear = el("button", "ytg-btn ytg-btn-ghost", "最初から");
      clear.addEventListener("click", function () {
        input = { rh: [], lh: [] };
        marks = null;
        render();
      });
      toolRow.appendChild(q2);
      toolRow.appendChild(q4);
      toolRow.appendChild(undo);
      toolRow.appendChild(clear);
      body.appendChild(toolRow);

      // 大譜表
      var staffWrap = el("div", "se-staffwrap");
      body.appendChild(staffWrap);

      var status = el("div", "se-status", "");
      body.appendChild(status);

      var row = el("div", "ytg-btnrow");
      var submit = el("button", "ytg-btn ytg-btn-primary", "Submit");
      submit.addEventListener("click", check);
      row.appendChild(submit);
      body.appendChild(row);
      setEnter(check);

      var svg = null, ghostNote = null;

      // SVG 内の論理座標
      function svgXY(ev) {
        var rect = svg.getBoundingClientRect();
        return {
          x: (ev.clientX - rect.left) * (VW / rect.width),
          y: (ev.clientY - rect.top) * (VH / rect.height)
        };
      }
      // x → 拍位置（小数。バーのパディングを考慮）
      function xToBeat(x) {
        var bar = Math.max(0, Math.min(BARS - 1, Math.floor((x - STAFF_LEFT) / BAR_W)));
        var xin = x - (STAFF_LEFT + bar * BAR_W + 16);
        var beatInBar = Math.max(0, Math.min(BEATS_PER_BAR - 0.01,
          xin / (BAR_W - 28) * BEATS_PER_BAR));
        return bar * BEATS_PER_BAR + beatInBar;
      }
      // マウス位置 → { hand, deg, onset }。縦=音高スナップ、横=自由（大まかでよい。
      // 「整列」または送信時に小節内で左詰め・拍スナップされる）。
      function mousePos(ev) {
        var p = svgXY(ev);
        var hand = p.y < STAFF_SPLIT_Y ? "rh" : "lh";
        var st = STAVES[hand];
        var deg = Math.round((st.bottomY - p.y) / STEP) + st.bottomDeg;
        if (deg < st.min || deg > st.max) return null;
        var onset = Math.max(0, Math.min(TOTAL_BEATS - palette, xToBeat(p.x)));
        return { hand: hand, deg: deg, onset: onset };
      }

      function ghost(ev) {
        if (ghostNote) { ghostNote.remove(); ghostNote = null; }
        if (!ev || !svg) return;
        var p = mousePos(ev);
        if (!p) return;
        ghostNote = buildNote(STAVES[p.hand], p.onset, p.deg, palette, "se-ghost");
        svg.appendChild(ghostNote);
      }

      function render() {
        staffWrap.innerHTML = "";
        svg = buildStaff();
        ["rh", "lh"].forEach(function (hand) {
          input[hand].forEach(function (n, i) {
            var cls = marks ? (marks[hand][i] ? "se-okn" : "se-ngn") : "";
            svg.appendChild(buildNote(STAVES[hand], n.onset, n.deg, n.dur, cls));
          });
        });
        svg.addEventListener("mousemove", ghost);
        svg.addEventListener("mouseleave", function () { ghost(); });
        // クリックで配置（位置は大まかでよい。整列/送信時に拍へスナップされる）
        svg.addEventListener("click", function (ev) {
          var p = mousePos(ev);
          if (!p) return;
          input[p.hand].push({ onset: p.onset, deg: p.deg, dur: palette, seq: seq++ });
          input[p.hand].sort(function (a, b) { return a.onset - b.onset; });
          marks = null;
          status.textContent = "";
          render();
        });
        // 右クリックで（クリック位置に最も近い）音符を削除
        svg.addEventListener("contextmenu", function (ev) {
          ev.preventDefault();
          var p = svgXY(ev);
          var hand = p.y < STAFF_SPLIT_Y ? "rh" : "lh";
          var best = -1, bestDist = 16; // 16px 以内のもの
          input[hand].forEach(function (n, i) {
            var d = Math.abs(noteX(n.onset) - p.x);
            if (d < bestDist) { bestDist = d; best = i; }
          });
          if (best !== -1) {
            input[hand].splice(best, 1);
            marks = null;
            render();
          }
        });
        staffWrap.appendChild(svg);

        // 「整列」ボタン（譜面右上）
        var align = el("button", "ytg-btn ytg-btn-ghost se-align", "整列");
        align.addEventListener("click", function () {
          alignAll();
          marks = null;
          render();
        });
        staffWrap.appendChild(align);
        status.textContent = "";
      }
      render();

      // 答え合わせ: まず整列（小節内左詰め・拍スナップ）してから、
      // 両手とも発音タイミング・音高・音価がすべて一致で正解
      function check() {
        alignAll();
        render();
        var rb = sumBeats("rh"), lb = sumBeats("lh");
        if (rb < TOTAL_BEATS || lb < TOTAL_BEATS) {
          status.textContent = "両手とも4小節ぶん埋めてから送信してください" +
            "（右手あと" + (TOTAL_BEATS - rb) + "拍・左手あと" + (TOTAL_BEATS - lb) + "拍）";
          return;
        }
        var q = question();
        var key = function (n) { return n.onset + "/" + n.deg + "/" + n.dur; };
        function grade(user, ans) {
          var set = {};
          ans.forEach(function (n) { set[key(n)] = true; });
          return user.map(function (n) { return !!set[key(n)]; });
        }
        marks = { rh: grade(input.rh, q.rh), lh: grade(input.lh, q.lh) };
        var allOk =
          input.rh.length === q.rh.length && marks.rh.every(Boolean) &&
          input.lh.length === q.lh.length && marks.lh.every(Boolean);
        if (allOk) {
          state.index++;
          if (state.index >= questions.length) complete();
          else showQuestion(true);
        } else {
          render();
          status.textContent = "間違いがあります（緑=合っている音・赤=違う音）";
        }
      }
    }

    // 全問終了 → 基盤側（ctx.onComplete）に委譲
    function complete() {
      stopAll();
      renderHeader();
      body.innerHTML = "";
      setEnter(null);
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
    id: "senritsu",
    title: TITLE,
    badge: BADGE,
    start: start,
    // テスト用に生成器などを公開（任意）。
    util: { makeQuestion: makeQuestion, degToMidi: degToMidi }
  });
})();
