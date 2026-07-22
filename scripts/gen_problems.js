// 候補JSON（正規化済みSFEN）を自前ソルバーで検証し、
// 「ちょうど3手詰め（1手では詰まない）」の先頭300問で problems.js を生成する。
// やねうら王の1手詰めルーチンは開き王手を見逃すことがあるため、この検証で除外する。
"use strict";
const fs = require("fs");
const path = require("path");

global.window = {};
require(path.join(__dirname, "..", "quizzes", "tsume", "shogi.js"));
const S = window.Kansho.tsumeShogi;

const candidates = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const TARGET = 300;

const accepted = [];
let rejected = 0;
for (const sfen of candidates) {
  if (accepted.length >= TARGET) break;
  const s = S.parseSfen(sfen);
  if (S.mateMove(s, 1) !== null) { rejected++; continue; } // 1手で詰む（開き王手等）
  if (S.mateMove(s, 3) === null) { rejected++; continue; } // 3手で詰まない（想定外）
  accepted.push(sfen);
}
if (accepted.length < TARGET) throw new Error("not enough problems: " + accepted.length);

const out = [];
out.push("// 詰将棋クイズのデータ（3手詰め・300問）。");
out.push("// 出典: やねうら王 詰将棋500万問（著作権は主張しない旨が明示されたデータ）から");
out.push("//       等間隔にサンプリングし、攻方=先手(b)に正規化したもの。");
out.push("// 全問を shogi.js のソルバーで検証済み: 1手では詰まず、3手で詰む。");
out.push("// （元データの「N-2手では詰まない」保証は開き王手を見逃すことが稀にあるため、");
out.push("//   生成時に自前ソルバーで再検証している。scratchpad/gen_problems.js 参照）");
out.push("// tsume.js から Kansho.data.tsumeProblems として参照される。");
out.push("(function () {");
out.push('  "use strict";');
out.push("");
out.push("  var K = window.Kansho || (window.Kansho = {});");
out.push("  K.data = K.data || {};");
out.push("");
out.push("  K.data.tsumeProblems = {");
out.push("    mate3: [");
for (const s of accepted) out.push('      "' + s + '",');
out.push("    ]");
out.push("  };");
out.push("})();");

fs.writeFileSync(process.argv[3], out.join("\n") + "\n");
console.log("OK:", accepted.length, "problems (rejected " + rejected + ") ->", process.argv[3]);
