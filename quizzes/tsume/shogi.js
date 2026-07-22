// 詰将棋クイズ用の将棋ルールエンジン＋簡易詰みソルバー。
//
// 「簡易詰みソルバー」= 攻方の手を王手に限定した全探索。
// 王手の候補手は少ないため、3〜9手程度の深さなら瞬時に読み切れる。
// 出題データが SFEN（局面のみ・解答なし）なので、
//   - ユーザーの着手の採点（残り手数以内の強制詰みを保つか）
//   - 玉方の応手の自動選択
// をこのソルバーが担う。解答データの同梱は不要になる。
//
// 実装は詰将棋に必要な範囲の完全なルール:
//   合法手生成（成・不成、打ち駒、二歩、行き所のない駒）、王手判定、
//   王手放置の禁止、打ち歩詰めの禁止。
// 正しさは、やねうら王データ（3手詰めであることが既知）に対する
// 全問一致テストで検証する（scratchpad のテストスクリプト参照）。
//
// tsume.js から Kansho.tsumeShogi として参照される。
(function () {
  "use strict";

  var K = window.Kansho || (window.Kansho = {});

  // ---- 駒の表現 -----------------------------------------------------------
  // 正=先手(攻方), 負=後手(玉方)。成駒は +8。
  var FU = 1, KY = 2, KE = 3, GI = 4, KI = 5, KA = 6, HI = 7, OU = 8;
  var PROMOTE = 8; // TO=9, 成香=10, 成桂=11, 成銀=12, 馬=14, 竜=15

  var SFEN_PIECE = { p: FU, l: KY, n: KE, s: GI, g: KI, b: KA, r: HI, k: OU };

  // ---- 利きの定義（先手基準。後手は dr を反転） ---------------------------
  // steps: 1歩だけ進める方向 / rays: 何マスでも滑る方向
  var GOLD_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
  var DEFS = {};
  DEFS[FU] = { steps: [[-1, 0]], rays: [] };
  DEFS[KY] = { steps: [], rays: [[-1, 0]] };
  DEFS[KE] = { steps: [[-2, -1], [-2, 1]], rays: [] };
  DEFS[GI] = { steps: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], rays: [] };
  DEFS[KI] = { steps: GOLD_STEPS, rays: [] };
  DEFS[KA] = { steps: [], rays: [[-1, -1], [-1, 1], [1, -1], [1, 1]] };
  DEFS[HI] = { steps: [], rays: [[-1, 0], [1, 0], [0, -1], [0, 1]] };
  DEFS[OU] = { steps: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], rays: [] };
  DEFS[FU + PROMOTE] = DEFS[KY + PROMOTE] = DEFS[KE + PROMOTE] = DEFS[GI + PROMOTE] = DEFS[KI]; // と・成香・成桂・成銀=金
  DEFS[KA + PROMOTE] = { steps: [[-1, 0], [1, 0], [0, -1], [0, 1]], rays: DEFS[KA].rays }; // 馬
  DEFS[HI + PROMOTE] = { steps: [[-1, -1], [-1, 1], [1, -1], [1, 1]], rays: DEFS[HI].rays }; // 竜

  // ---- 局面の表現 ----------------------------------------------------------
  // board: 長さ81の配列。idx = r*9 + c（r=0が一段目, c=0が9筋）。
  // hands: [先手, 後手] それぞれ長さ8の配列（[駒種] = 枚数）。
  // turn : 1=先手, -1=後手。
  function parseSfen(sfen) {
    var parts = sfen.split(/\s+/);
    var board = [];
    for (var i = 0; i < 81; i++) board.push(0);
    var rows = parts[0].split("/");
    for (var r = 0; r < 9; r++) {
      var c = 0, row = rows[r];
      for (var k = 0; k < row.length; k++) {
        var ch = row[k];
        if (ch >= "1" && ch <= "9") { c += parseInt(ch, 10); continue; }
        var promoted = 0;
        if (ch === "+") { promoted = PROMOTE; k++; ch = row[k]; }
        var type = SFEN_PIECE[ch.toLowerCase()] + promoted;
        board[r * 9 + c] = (ch === ch.toUpperCase()) ? type : -type;
        c++;
      }
    }
    var hands = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
    if (parts[2] && parts[2] !== "-") {
      var num = 0;
      for (var k = 0; k < parts[2].length; k++) {
        var ch = parts[2][k];
        if (ch >= "0" && ch <= "9") { num = num * 10 + (+ch); continue; }
        var type = SFEN_PIECE[ch.toLowerCase()];
        hands[ch === ch.toUpperCase() ? 0 : 1][type] += (num || 1);
        num = 0;
      }
    }
    return { board: board, hands: hands, turn: parts[1] === "w" ? -1 : 1 };
  }

  function clone(s) {
    return {
      board: s.board.slice(),
      hands: [s.hands[0].slice(), s.hands[1].slice()],
      turn: s.turn
    };
  }

  // ---- 利き・王手判定 ------------------------------------------------------
  // color の駒が idx に利いているか
  function attacks(s, color, target) {
    var tr = Math.floor(target / 9), tc = target % 9;
    for (var i = 0; i < 81; i++) {
      var p = s.board[i];
      if (p === 0 || (p > 0 ? 1 : -1) !== color) continue;
      var def = DEFS[Math.abs(p)];
      var r = Math.floor(i / 9), c = i % 9;
      var j;
      for (j = 0; j < def.steps.length; j++) {
        var dr = def.steps[j][0] * color, dc = def.steps[j][1];
        if (r + dr === tr && c + dc === tc) return true;
      }
      for (j = 0; j < def.rays.length; j++) {
        var dr = def.rays[j][0] * color, dc = def.rays[j][1];
        var rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) {
          if (rr === tr && cc === tc) return true;
          if (s.board[rr * 9 + cc] !== 0) break;
          rr += dr; cc += dc;
        }
      }
    }
    return false;
  }

  function findKing(s, color) {
    var target = OU * color;
    for (var i = 0; i < 81; i++) if (s.board[i] === target) return i;
    return -1;
  }

  // color の玉に王手がかかっているか（玉が無ければ false）
  function inCheck(s, color) {
    var k = findKing(s, color);
    if (k === -1) return false;
    return attacks(s, -color, k);
  }

  // ---- 着手 ----------------------------------------------------------------
  // move: { from: idx | -1(打つ), to: idx, piece: 駒種(符号なし・成る前), promote: bool }
  function applyMove(s, m) {
    var n = clone(s);
    var color = s.turn;
    if (m.from === -1) {
      n.hands[color === 1 ? 0 : 1][m.piece]--;
      n.board[m.to] = m.piece * color;
    } else {
      var captured = n.board[m.to];
      if (captured !== 0) {
        var base = Math.abs(captured) > PROMOTE ? Math.abs(captured) - PROMOTE : Math.abs(captured);
        n.hands[color === 1 ? 0 : 1][base]++;
      }
      n.board[m.from] = 0;
      n.board[m.to] = (m.piece + (m.promote ? PROMOTE : 0)) * color;
    }
    n.turn = -color;
    return n;
  }

  // ---- 合法手生成 ----------------------------------------------------------
  function canPromoteType(type) {
    return type === FU || type === KY || type === KE || type === GI || type === KA || type === HI;
  }
  function inPromoZone(r, color) { return color === 1 ? r <= 2 : r >= 6; }
  // 行き所のない駒になるか（＝その位置では成りが必須）
  function mustPromote(type, toR, color) {
    var last = color === 1 ? 0 : 8;
    var last2 = color === 1 ? 1 : 7;
    if (type === FU || type === KY) return toR === last;
    if (type === KE) return toR === last || toR === last2;
    return false;
  }

  // 疑似合法手（王手放置・打ち歩詰めのチェック前）
  function pseudoMoves(s) {
    var color = s.turn;
    var moves = [];
    var i, j;

    for (i = 0; i < 81; i++) {
      var p = s.board[i];
      if (p === 0 || (p > 0 ? 1 : -1) !== color) continue;
      var abs = Math.abs(p);
      var def = DEFS[abs];
      var r = Math.floor(i / 9), c = i % 9;
      var baseType = abs > PROMOTE ? abs - PROMOTE : abs;
      var isPromoted = abs > PROMOTE;

      var dests = [];
      for (j = 0; j < def.steps.length; j++) {
        var rr = r + def.steps[j][0] * color, cc = c + def.steps[j][1];
        if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) dests.push(rr * 9 + cc);
      }
      for (j = 0; j < def.rays.length; j++) {
        var dr = def.rays[j][0] * color, dc = def.rays[j][1];
        var rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) {
          dests.push(rr * 9 + cc);
          if (s.board[rr * 9 + cc] !== 0) break;
          rr += dr; cc += dc;
        }
      }
      for (j = 0; j < dests.length; j++) {
        var to = dests[j];
        var q = s.board[to];
        if (q !== 0 && (q > 0 ? 1 : -1) === color) continue; // 自駒がある
        var toR = Math.floor(to / 9);
        var movePiece = isPromoted ? abs : baseType; // 成駒はそのまま動く
        if (isPromoted || !canPromoteType(baseType)) {
          moves.push({ from: i, to: to, piece: abs, promote: false });
        } else {
          var canP = inPromoZone(toR, color) || inPromoZone(r, color);
          var mustP = mustPromote(baseType, toR, color);
          if (!mustP) moves.push({ from: i, to: to, piece: baseType, promote: false });
          if (canP && canPromoteType(baseType)) moves.push({ from: i, to: to, piece: baseType, promote: true });
        }
      }
    }

    // 打ち駒
    var hand = s.hands[color === 1 ? 0 : 1];
    for (var type = FU; type <= HI; type++) {
      if (hand[type] <= 0) continue;
      for (i = 0; i < 81; i++) {
        if (s.board[i] !== 0) continue;
        var r = Math.floor(i / 9), c = i % 9;
        if (mustPromote(type, r, color)) continue; // 行き所のない駒
        if (type === FU) {
          // 二歩
          var nifu = false;
          for (j = 0; j < 9; j++) {
            if (s.board[j * 9 + c] === FU * color) { nifu = true; break; }
          }
          if (nifu) continue;
        }
        moves.push({ from: -1, to: i, piece: type, promote: false });
      }
    }
    return moves;
  }

  // 合法手（王手放置の禁止・打ち歩詰めの禁止を含む）。
  // allowUchifuzume: 打ち歩詰め判定の内側での再帰用（それ以上は掘らない）。
  function legalMoves(s, allowUchifuzume) {
    var color = s.turn;
    var out = [];
    var moves = pseudoMoves(s);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var n = applyMove(s, m);
      if (inCheck(n, color)) continue; // 王手放置・自殺手
      if (!allowUchifuzume && m.from === -1 && m.piece === FU && inCheck(n, -color)) {
        // 打ち歩詰め: 歩を打って王手し、相手に合法手が無ければ反則
        if (legalMoves(n, true).length === 0) continue;
      }
      out.push(m);
    }
    return out;
  }

  // その手を指すと相手玉に王手がかかるか
  function givesCheck(s, m) {
    var n = applyMove(s, m);
    return inCheck(n, n.turn);
  }

  // ---- 簡易詰みソルバー ----------------------------------------------------
  // 手番側（攻方）が plies 手以内に詰ませられるなら、その初手を返す。無ければ null。
  // 攻方の手は王手に限定する（詰将棋のルール＝分岐が少なく高速）。
  function mateMove(s, plies) {
    var moves = legalMoves(s);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!givesCheck(s, m)) continue;
      var n = applyMove(s, m);
      var replies = legalMoves(n);
      if (replies.length === 0) return m; // 詰み
      if (plies >= 3 && allRepliesLose(n, replies, plies - 2)) return m;
    }
    return null;
  }

  // 玉方のどの応手にも plies 手以内の詰みがあるか（replies は legalMoves(s) 済み）
  function allRepliesLose(s, replies, plies) {
    for (var i = 0; i < replies.length; i++) {
      var n = applyMove(s, replies[i]);
      if (!mateMove(n, plies)) return false;
    }
    return true;
  }

  K.tsumeShogi = {
    FU: FU, KY: KY, KE: KE, GI: GI, KI: KI, KA: KA, HI: HI, OU: OU, PROMOTE: PROMOTE,
    parseSfen: parseSfen,
    clone: clone,
    applyMove: applyMove,
    legalMoves: legalMoves,
    givesCheck: givesCheck,
    inCheck: inCheck,
    attacks: attacks,
    findKing: findKing,
    mateMove: mateMove,
    allRepliesLose: allRepliesLose
  };
})();
