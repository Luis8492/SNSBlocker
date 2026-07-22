# -*- coding: utf-8 -*-
# やねうら王詰将棋データ(SFEN)から問題をサンプリングし、
# 「攻方=先手(b)」に正規化して quizzes/tsume/problems.js を生成する。
#
# 正規化: 手番が w の局面は盤を180度回転し先後の駒・持駒を入れ替える
# （将棋は先後対称なので詰みの性質は保存される）。
import io, sys, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SRC = r"D:\SNSBlocker\tmp\mate3_5_7_9_11\mate3.sfen"
OUT = sys.argv[1]  # 候補JSONの出力先（problems.js の生成は gen_problems.js が行う）
COUNT = 340  # 候補数。Node側でソルバー検証（ちょうど3手詰め）に通った先頭300問を採用する

HAND_ORDER = "RBGSNLP"

def parse_board(board_str):
    """SFEN盤面 -> 9x9 のトークン格子（None または 'P' '+p' など）"""
    grid = []
    for row in board_str.split("/"):
        cells = []
        i = 0
        while i < len(row):
            ch = row[i]
            if ch.isdigit():
                cells.extend([None] * int(ch))
                i += 1
            elif ch == "+":
                cells.append("+" + row[i + 1])
                i += 2
            else:
                cells.append(ch)
                i += 1
        assert len(cells) == 9, row
        grid.append(cells)
    assert len(grid) == 9, board_str
    return grid

def build_board(grid):
    rows = []
    for cells in grid:
        row, run = "", 0
        for c in cells:
            if c is None:
                run += 1
            else:
                if run: row += str(run); run = 0
                row += c
        if run: row += str(run)
        rows.append(row)
    return "/".join(rows)

def swap_token(tok):
    if tok is None: return None
    if tok.startswith("+"):
        return "+" + tok[1].swapcase()
    return tok.swapcase()

def flip(grid):
    """180度回転＋先後入替"""
    return [[swap_token(grid[8 - r][8 - c]) for c in range(9)] for r in range(9)]

def parse_hands(hands):
    """持駒文字列 -> {piece_letter: count}（大文字=先手, 小文字=後手）"""
    d = {}
    for m in re.finditer(r"(\d*)([RBGSNLPrbgsnlp])", hands if hands != "-" else ""):
        d[m.group(2)] = d.get(m.group(2), 0) + int(m.group(1) or 1)
    return d

def build_hands(d):
    if not d: return "-"
    out = ""
    for up in HAND_ORDER:
        for ch in (up, ):
            n = d.get(ch, 0)
            if n: out += (str(n) if n > 1 else "") + ch
    for up in HAND_ORDER:
        ch = up.lower()
        n = d.get(ch, 0)
        if n: out += (str(n) if n > 1 else "") + ch
    return out

def normalize(sfen_line):
    parts = sfen_line.split()
    board, turn, hands = parts[0], parts[1], parts[2]
    if turn == "b":
        return board + " b " + hands + " 1"
    grid = flip(parse_board(board))
    d = {k.swapcase(): v for k, v in parse_hands(hands).items()}
    return build_board(grid) + " b " + build_hands(d) + " 1"

# 全体から等間隔にサンプリング
lines = []
with open(SRC, encoding="ascii") as f:
    src = f.read().splitlines()
stride = len(src) // COUNT
picked = [src[i * stride] for i in range(COUNT)]

norm = [normalize(x) for x in picked]

# 検査: 双方の玉があり、手番が b であること
for s in norm:
    b = s.split()[0]
    assert "K" in b and "k" in b, s
    assert s.split()[1] == "b"

import json
json.dump(norm, open(OUT, "w", encoding="utf-8"), indent=0)
print("OK:", len(norm), "candidates ->", OUT)
