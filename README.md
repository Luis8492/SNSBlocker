# YouTube 書き取り関所

YouTube を見すぎないための Chrome 拡張機能です。
動画ページを開くと画面がオーバーレイされ、**課題（クイズ）**を課されます。
1ラウンドの全問を正解すると、その動画のロックが解除されます。

## 動作の流れ

1. YouTube の動画（`/watch` または `/shorts`）を開くと、画面全体が課題で覆われる（背後の動画は自動停止）。
2. 選択パネルで有効にしたクイズ（複数ならランダムで1つ）が出題される。
3. 1ラウンドの全問をクリアすると、2 つの選択肢が出る：
   - **もっと続ける!!!** — YouTube を離れ、拡張機能内の継続ページ（`continue.html`）へ遷移し、そこで課題を好きなだけ続けられる。
   - **動画を見る** — その動画のロックを解除して視聴する。

## インストール（開発者モードで読み込み）

1. Chrome で `chrome://extensions` を開く。
2. 右上の「**デベロッパーモード**」を ON。
3. 「**パッケージ化されていない拡張機能を読み込む**」をクリック。
4. このフォルダ（`D:\SNSBlocker`）を選択。
5. YouTube の動画を開いて動作確認。

## 収録プラグイン

各プラグインの仕様・データの出所・難易度調整は、**各フォルダの README** を参照。

| プラグイン | id | 詳細 |
|---|---|---|
| 古典文学の書き取り | `koten` | [quizzes/koten/README.md](quizzes/koten/README.md) |
| 百人一首 | `hyakunin` | [quizzes/hyakunin/README.md](quizzes/hyakunin/README.md) |
| 重音(2音)の聴音 | `juon` | [quizzes/juon/README.md](quizzes/juon/README.md) |
| 詰将棋(3手詰) | `tsume` | [quizzes/tsume/README.md](quizzes/tsume/README.md) |

### 出題プラグインの選択パネル

ツールバーの拡張機能アイコンを**クリック**（または右クリック→「オプション」）すると
選択パネルが開き、出題するクイズをチェックボックスで選べる（**複数選択可**・最低1つ）。

- 選択は `chrome.storage.sync` の `enabledQuizzes` に保存され、開いているタブにも
  次の関所/ラウンドから反映される。
- **複数選択時は、動画を開くたびにランダム**でいずれか1つが出題される。
  1ラウンド（3問など、問数はプラグインごと）は同じプラグインから出る。
- ストレージ未設定（初回・フォーク運用）のときは `config.js` の `activeQuiz` が使われる。

## アーキテクチャ（基盤 / クイズ の分離）

**基盤部分**と**クイズ部分**を分離している。基盤は「どの形式か」を一切知らず、
選択パネル（または `config.js`）で選ばれたクイズに出題を委譲する。

```
core/registry.js   基盤: クイズを登録・選択するレジストリ（window.Kansho）
core/ui.js         基盤: 形式非依存の共有UI部品（el / コピペ禁止 / 進捗ヘッダ）
core/host.js       基盤: YouTube関所（動画検知・オーバーレイ・ロック管理・クリア後画面）
core/overlay.css   基盤: 共通スタイル（オーバーレイ/カード/ヘッダ/ボタン/進捗ドット）
config.js          どの形式を出すか（選択パネルの保存値の読み込み＋フォーク用の既定値）
continue.html/js   基盤: 継続ページ
options.html/js    基盤: 出題プラグインの選択パネル（ツールバーアイコンから開く）
quizzes/<id>/      クイズ: 1フォルダ＝1プラグイン（ロジック・データ・CSS・README）
```

- **フォーク運用**するなら、`quizzes/` に目的の形式だけを残し、`config.js` の `activeQuiz` を
  その id にする（ストレージ未設定ならこの値が使われる）。基盤（`core/`）は変更不要。
  各クイズは他クイズに依存しない自己完結を保つこと
  （hyakunin が koten と採点ロジックを重複して持つのはこのため）。
- **拡張機能内での切り替え**は上記の選択パネルで行う。

### 新しいクイズ形式を追加する

1. `quizzes/<形式名>/` を作り、その中で `Kansho.registerQuiz({ ... })` を呼ぶスクリプトを書く。

   ```js
   Kansho.registerQuiz({
     id: "shogi",            // 選択パネル・config.activeQuiz と対応
     title: "次の一手",
     icon: "♟",
     // 1ラウンドを container に構築し、クリアで ctx.onComplete(info) を呼ぶ。
     // info = { body, ui, el, restart } を渡すと基盤がクリア後画面を描く。
     start: function (container, ctx) { /* … */ }
   });
   ```

   共有UI（`Kansho.ui.el` / `forbidCopy` / `forbidPaste` / `renderHeader`）を利用でき、
   採点などその形式固有のロジックはこのフォルダ内に閉じ込める。データは
   `Kansho.data.<形式名>…` に置くと基盤の他部分から独立する。固有のスタイルは
   `quizzes/<形式名>/<形式名>.css` に置く（基盤CSSの後に読み込むので `.ytg-btn` 等を上書きできる）。
   プラグインの説明は `quizzes/<形式名>/README.md` に書く。
2. `manifest.json` の `content_scripts.js` / `content_scripts.css` / `web_accessible_resources`、
   `continue.html` の `<script>`・`<link>`、および `options.html` の `<script>` に、
   追加したファイルを（JSは `config.js` の後・`core/host.js` の前、CSSは
   `core/overlay.css` の後に）登録する。
3. 選択パネルで新しいクイズにチェックを入れると出題される。

## 仕様メモ

- 解除状態は **タブのセッション中のみ**保持（`sessionStorage`）。タブを閉じて開き直すと再度出題されます。動画ごとに個別に判定します。
- コピー・ペースト・右クリック・ドラッグは課題エリア内で無効化しています（自制のためのツールなので、完全な回避防止は目的としていません）。
