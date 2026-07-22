// 詰将棋クイズ（3手詰め）— 出題ロジック。
//
// 将棋盤をクリックして詰手順を指す。ルール判定と玉方の応手は
// shogi.js（ルールエンジン＋簡易詰みソルバー）に委譲する。
//   - 攻方（ユーザー）の手は王手のみ指せる（王手にならない手は選べない）
//   - 着手後、玉方がどう応じても残り手数で詰むならその手は正解として進行。
//     逃れ手があるなら「間違い」→ 指し直し
//   - 玉方の応手はソルバー検証済みの合法手からランダムに選ぶ（どれも敗着）
//   - 余詰（別解の詰み筋）も正解として受け入れる
//
// 基盤層（Kansho）へ registerQuiz で登録する。プラグインとして自己完結。
//   ctx.onComplete : 全問クリア時に基盤が渡すコールバック
//   ctx.options    : { problems } — 出題を固定したい場合（省略時ランダム）
(function () {
  "use strict";

  var K = window.Kansho;
  var ui = K.ui;
  var el = ui.el;
  var S = K.tsumeShogi;

  var ICON = "♟";
  var TITLE = "詰将棋(3手詰)";
  var PROBLEMS_PER_ROUND = 3;
  var PLIES = 3; // 3手詰め

  // 駒の表示文字（成駒は1文字の略記）
  var CHAR = {};
  CHAR[S.FU] = "歩"; CHAR[S.KY] = "香"; CHAR[S.KE] = "桂"; CHAR[S.GI] = "銀";
  CHAR[S.KI] = "金"; CHAR[S.KA] = "角"; CHAR[S.HI] = "飛"; CHAR[S.OU] = "玉";
  CHAR[S.FU + S.PROMOTE] = "と"; CHAR[S.KY + S.PROMOTE] = "杏";
  CHAR[S.KE + S.PROMOTE] = "圭"; CHAR[S.GI + S.PROMOTE] = "全";
  CHAR[S.KA + S.PROMOTE] = "馬"; CHAR[S.HI + S.PROMOTE] = "竜";
  // 持駒の枚数表記（歩は最大18枚まで持ちうる）
  var KANJI_NUM = ["", "", "二", "三", "四", "五", "六", "七", "八", "九",
    "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八"];

  function pickProblems(all, count) {
    var pool = all.slice();
    var picked = [];
    while (picked.length < count && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  function start(container, ctx) {
    ctx = ctx || {};
    var opts = ctx.options || {};
    var all = (K.data.tsumeProblems && K.data.tsumeProblems.mate3) || [];
    var problems = (opts.problems && opts.problems.length)
      ? opts.problems
      : pickProblems(all, Math.min(PROBLEMS_PER_ROUND, all.length));
    var state = { index: 0 };

    container.innerHTML = "";
    var header = el("div", "ytg-header");
    var body = el("div", "ytg-body");
    container.appendChild(header);
    container.appendChild(body);

    // 現在の問題の進行状態
    var g = null; // { s, remaining, last, phase, sel, userMoves, preMove, pendingPromo }

    function renderHeader() {
      ui.renderHeader(header, {
        icon: ICON, title: TITLE,
        total: problems.length, index: state.index
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

    // ---- 問題のロード ------------------------------------------------------
    function loadProblem() {
      g = {
        s: S.parseSfen(problems[state.index]),
        remaining: PLIES,
        last: null,
        phase: "user",   // user | anim | wrong | done
        sel: null,       // { kind: "board"|"hand", idx|piece }
        preMove: null,   // 指し直し用（直前のユーザー着手前の状態）
        pendingPromo: null
      };
      g.userMoves = checkMoves(g.s);
      render();
    }

    // 攻方の候補手＝王手になる合法手のみ
    function checkMoves(s) {
      return S.legalMoves(s).filter(function (m) { return S.givesCheck(s, m); });
    }

    // ---- 画面描画 ----------------------------------------------------------
    function render() {
      renderHeader();
      body.innerHTML = "";

      body.appendChild(el("div", "ytg-hint", PLIES + "手詰"));

      // 玉方（上側）の持駒
      body.appendChild(handView(-1));

      // 盤
      var board = el("div", "ts-board");
      var candSet = {};
      if (g.sel) {
        movesFromSel().forEach(function (m) { candSet[m.to] = true; });
      }
      for (var i = 0; i < 81; i++) {
        var cell = el("div", "ts-cell");
        cell.setAttribute("data-idx", i);
        var p = g.s.board[i];
        if (p !== 0) {
          var pc = el("span", "ts-piece" + (p < 0 ? " ts-gote" : "") +
            (Math.abs(p) > S.PROMOTE ? " ts-promoted" : ""), CHAR[Math.abs(p)]);
          cell.appendChild(pc);
        }
        if (g.last === i) cell.classList.add("ts-last");
        if (g.sel && g.sel.kind === "board" && g.sel.idx === i) cell.classList.add("ts-selsq");
        if (candSet[i]) cell.classList.add("ts-cand");
        board.appendChild(cell);
      }
      board.addEventListener("click", onBoardClick);
      body.appendChild(board);

      // 攻方（下側）の持駒
      body.appendChild(handView(1));

      // 状態表示・操作列
      var status = el("div", "ts-status");
      status.className = "ts-status";
      body.appendChild(status);

      if (g.phase === "wrong") {
        status.appendChild(el("div", "ytg-result ytg-ng", g.wrongMsg || "玉方に逃れ手があります"));
        var row = el("div", "ytg-btnrow");
        var undo = el("button", "ytg-btn ytg-btn-primary", "指し直す");
        undo.addEventListener("click", undoMove);
        row.appendChild(undo);
        body.appendChild(row);
        setEnter(undoMove);
        return;
      }

      if (g.pendingPromo) {
        status.appendChild(el("span", "ts-msg", "成りますか？　"));
        var yes = el("button", "ytg-btn ytg-btn-primary", "成る");
        yes.addEventListener("click", function () { execMove(g.pendingPromo.promo); });
        var no = el("button", "ytg-btn ytg-btn-ghost", "成らず");
        no.addEventListener("click", function () { execMove(g.pendingPromo.plain); });
        status.appendChild(yes);
        status.appendChild(no);
        setEnter(function () { execMove(g.pendingPromo.promo); });
        return;
      }

      if (g.msg) status.appendChild(el("span", "ts-msg", g.msg));

      var row = el("div", "ytg-btnrow");
      var hint = el("button", "ytg-btn ytg-btn-ghost", "ヒント: 次の一手");
      hint.addEventListener("click", showHint);
      var reset = el("button", "ytg-btn ytg-btn-ghost", "初形に戻す");
      reset.addEventListener("click", function () { loadProblem(); });
      row.appendChild(hint);
      row.appendChild(reset);
      body.appendChild(row);
      setEnter(null);
    }

    // 持駒の表示（color=1: 攻方・クリック可 / color=-1: 玉方・表示のみ）
    function handView(color) {
      var wrap = el("div", "ts-hand" + (color === 1 ? " ts-hand-sente" : " ts-hand-gote"));
      wrap.appendChild(el("span", "ts-hand-label", color === 1 ? "攻方 持駒" : "玉方 持駒"));
      var hand = g.s.hands[color === 1 ? 0 : 1];
      var any = false;
      for (var t = S.HI; t >= S.FU; t--) {
        if (hand[t] <= 0) continue;
        any = true;
        var chip = el("span", "ts-chip" + (color === 1 ? " ts-chip-mine" : ""),
          CHAR[t] + (hand[t] > 1 ? KANJI_NUM[hand[t]] : ""));
        if (color === 1) {
          chip.setAttribute("data-piece", t);
          if (g.sel && g.sel.kind === "hand" && g.sel.piece === t) chip.classList.add("ts-selsq");
          chip.addEventListener("click", onHandClick);
        }
        wrap.appendChild(chip);
      }
      if (!any) wrap.appendChild(el("span", "ts-chip ts-chip-none", "なし"));
      return wrap;
    }

    // 選択元からの候補手
    function movesFromSel() {
      if (!g.sel) return [];
      return g.userMoves.filter(function (m) {
        return g.sel.kind === "board" ? m.from === g.sel.idx
                                      : (m.from === -1 && m.piece === g.sel.piece);
      });
    }

    // ---- 入力処理 ----------------------------------------------------------
    function onBoardClick(ev) {
      if (g.phase !== "user" || g.pendingPromo) return;
      var cell = ev.target.closest("[data-idx]");
      if (!cell) return;
      var idx = parseInt(cell.getAttribute("data-idx"), 10);

      // 候補マスなら着手
      if (g.sel) {
        var moves = movesFromSel().filter(function (m) { return m.to === idx; });
        if (moves.length === 1) { execMove(moves[0]); return; }
        if (moves.length === 2) { // 成/不成の選択
          g.pendingPromo = {
            promo: moves[0].promote ? moves[0] : moves[1],
            plain: moves[0].promote ? moves[1] : moves[0]
          };
          render();
          return;
        }
      }
      // 自駒の選択（王手候補手を持つ駒のみ意味を持つ）
      if (g.s.board[idx] > 0) {
        g.sel = { kind: "board", idx: idx };
        g.msg = movesFromSel().length ? "" : "この駒には王手になる手がありません";
      } else {
        g.sel = null;
        g.msg = "";
      }
      render();
    }

    function onHandClick(ev) {
      if (g.phase !== "user" || g.pendingPromo) return;
      var piece = parseInt(ev.currentTarget.getAttribute("data-piece"), 10);
      g.sel = { kind: "hand", piece: piece };
      g.msg = movesFromSel().length ? "" : "この駒には王手になる打ち場所がありません";
      render();
    }

    // ---- 着手の実行と判定 --------------------------------------------------
    function execMove(m) {
      g.preMove = { s: g.s, remaining: g.remaining, last: g.last };
      g.pendingPromo = null;
      g.sel = null;
      g.msg = "";

      g.s = S.applyMove(g.s, m);
      g.last = m.to;
      g.remaining--;

      var replies = S.legalMoves(g.s);
      if (replies.length === 0) { succeed(); return; }

      // 玉方に応手がある: 残り手数内の強制詰みを保っているか
      if (g.remaining < 2 || !S.allRepliesLose(g.s, replies, g.remaining - 1)) {
        g.phase = "wrong";
        g.wrongMsg = g.remaining < 1 ? "詰みませんでした（手数超過）" : "玉方に逃れ手があります";
        render();
        return;
      }

      // 玉方の応手（どれも敗着なのでランダムに選ぶ）
      g.phase = "anim";
      render();
      setTimeout(function () {
        if (!container.isConnected || g.phase !== "anim") return;
        var r = replies[Math.floor(Math.random() * replies.length)];
        g.s = S.applyMove(g.s, r);
        g.last = r.to;
        g.remaining--;
        g.phase = "user";
        g.userMoves = checkMoves(g.s);
        render();
      }, 600);
    }

    function undoMove() {
      if (!g.preMove) return;
      g.s = g.preMove.s;
      g.remaining = g.preMove.remaining;
      g.last = g.preMove.last;
      g.preMove = null;
      g.phase = "user";
      g.wrongMsg = "";
      g.userMoves = checkMoves(g.s);
      render();
    }

    function succeed() {
      g.phase = "done";
      render(); // 詰み上がりの局面を見せる
      // 「正解」を盤面中央にオーバーレイ表示し、フェードアウト後に次の問題へ
      var board = body.querySelector(".ts-board");
      if (board) {
        board.appendChild(el("div", "ts-correct-overlay ts-fadeout", "正解"));
      }
      state.index++;
      setTimeout(function () {
        if (!container.isConnected) return;
        if (state.index >= problems.length) complete();
        else loadProblem();
      }, 1400);
    }

    // ヒント: 詰み筋の次の一手の移動元と移動先を光らせる
    function showHint() {
      if (g.phase !== "user") return;
      var m = S.mateMove(g.s, g.remaining);
      if (!m) return;
      var cells = body.querySelectorAll(".ts-cell");
      [m.from, m.to].forEach(function (idx) {
        if (idx < 0) return;
        cells[idx].classList.add("ts-flash");
      });
      if (m.from === -1) {
        var chip = body.querySelector('.ts-chip[data-piece="' + m.piece + '"]');
        if (chip) chip.classList.add("ts-flash");
      }
      setTimeout(function () {
        if (!container.isConnected) return;
        body.querySelectorAll(".ts-flash").forEach(function (n) {
          n.classList.remove("ts-flash");
        });
      }, 1500);
    }

    // 全問終了 → 基盤側（ctx.onComplete）に委譲
    function complete() {
      renderHeader();
      body.innerHTML = "";
      setEnter(null);
      if (typeof ctx.onComplete === "function") {
        ctx.onComplete({
          container: container,
          body: body,
          ui: ui,
          el: el,
          restart: function (problemsOverride) {
            start(container, Object.assign({}, ctx, {
              options: Object.assign({}, opts, { problems: problemsOverride || null })
            }));
          }
        });
      }
    }

    loadProblem();
  }

  // ---- 基盤へ登録 ----------------------------------------------------------
  K.registerQuiz({
    id: "tsume",
    title: TITLE,
    icon: ICON,
    start: start
  });
})();
