// 候補JSON（正規化済みSFEN）を自前ソルバーで検証し、problems.js を生成する。
// 「ちょうどN手詰め（N-2手では詰まない）」の先頭300問を手数ごとに採用する。
// やねうら王の高速詰め判定は開き王手を見逃すことがあるため、この検証で除外する。
//
// 使い方: node gen_problems.js <出力先.js> <N>:<候補.json> [<N>:<候補.json> ...]
//   例:   node gen_problems.js extension/quizzes/tsume/problems.js 3:c3.json 5:c5.json 7:c7.json
"use strict";
const fs = require("fs");
const path = require("path");

global.window = {};
require(path.join(__dirname, "..", "extension", "quizzes", "tsume", "shogi.js"));
const S = window.Kansho.tsumeShogi;

const TARGET = 300;
const outPath = process.argv[2];
const sets = process.argv.slice(3).map(function (arg) {
  const i = arg.indexOf(":");
  return { plies: parseInt(arg.slice(0, i), 10), file: arg.slice(i + 1) };
});

const result = {}; // key "mate3" など -> sfen配列
for (const set of sets) {
  const candidates = JSON.parse(fs.readFileSync(set.file, "utf8"));
  const accepted = [];
  let rejected = 0;
  const t0 = Date.now();
  for (const sfen of candidates) {
    if (accepted.length >= TARGET) break;
    const s = S.parseSfen(sfen);
    if (S.mateMove(s, set.plies - 2) !== null) { rejected++; continue; } // 短手数で詰む
    if (S.mateMove(s, set.plies) === null) { rejected++; continue; }     // N手で詰まない
    accepted.push(sfen);
  }
  if (accepted.length < TARGET) {
    throw new Error("not enough problems for mate" + set.plies + ": " + accepted.length);
  }
  result["mate" + set.plies] = accepted;
  console.log("mate" + set.plies + ": " + accepted.length + " problems (rejected " +
    rejected + ", " + (Date.now() - t0) + "ms)");
}

const out = [];
out.push("// 詰将棋クイズのデータ（各手数300問）。");
out.push("// 出典: やねうら王 詰将棋500万問（著作権は主張しない旨が明示されたデータ）から");
out.push("//       等間隔にサンプリングし、攻方=先手(b)に正規化したもの。");
out.push("// 全問を shogi.js のソルバーで検証済み: N-2手では詰まず、N手で詰む。");
out.push("// （元データの「N-2手では詰まない」保証は開き王手を見逃すことが稀にあるため、");
out.push("//   scripts/sample_tsume.py → scripts/gen_problems.js で再検証・再生成できる）");
out.push("// tsume.js から Kansho.data.tsumeProblems として参照される。");
out.push("(function () {");
out.push('  "use strict";');
out.push("");
out.push("  var K = window.Kansho || (window.Kansho = {});");
out.push("  K.data = K.data || {};");
out.push("");
out.push("  K.data.tsumeProblems = {");
const keys = Object.keys(result);
keys.forEach(function (key, ki) {
  out.push("    " + key + ": [");
  for (const s of result[key]) out.push('      "' + s + '",');
  out.push("    ]" + (ki < keys.length - 1 ? "," : ""));
});
out.push("  };");
out.push("})();");

fs.writeFileSync(outPath, out.join("\n") + "\n");
console.log("OK ->", outPath);
