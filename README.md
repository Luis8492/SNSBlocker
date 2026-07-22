# YouTube 書き取り関所

YouTube を見すぎないための Chrome 拡張機能です。
動画ページを開くと画面がオーバーレイされ、**古典文学の書き取り**を課されます。
一続きの文章を複数に分けて出題し、**その作品の全問を正解する**と、その動画のロックが解除されます。
出題数は作品ごとの分割数（`segments` の数）に等しく、長い作品ほど問数が増えます。

## 動作の流れ

1. YouTube の動画（`/watch` または `/shorts`）を開くと、画面全体が書き取り課題で覆われる（背後の動画は自動停止）。
2. 文章と「**覚えた**」ボタンが表示される（この文章は**コピー不可**）。
3. 「覚えた」を押すと入力画面へ。文章は隠れる（入力欄は**貼り付け不可**）。
4. 入力して「**Submit**」：
   - 正解 → 淡々と次の文章へ（褒めたり「正解！」と出したりはしない）。
   - 不正解 → **diff 表示**（誤り＝赤の取り消し線、抜け＝緑）＋「**やり直す**」ボタン。
5. その作品の全問をクリアすると、2 つの選択肢が出る：
   - **YouTubeはやめてもっと続ける!!!** — YouTube を離れ、拡張機能内の継続ページ（`continue.html`）へ遷移し、そこで書き取りを好きなだけ続けられる。
   - **動画を見る** — その動画のロックを解除して視聴する。

出題される作品：徒然草・方丈記・枕草子・平家物語・論語・Hamlet・The Prince（ランダム）。
`quizzes/dictation/passages.js` を編集すれば作品や分割を自由に追加・変更できます。

### 表記ゆれの許容

答え合わせは、**句読点・記号・空白・全角/半角・英字の大文字小文字**の違いを正規化して無視します（`quizzes/dictation/dictation.js` の `normalize`）。それ以外の文字（かな・漢字・単語）は 1 文字単位で厳密に判定します。

## インストール（開発者モードで読み込み）

1. Chrome で `chrome://extensions` を開く。
2. 右上の「**デベロッパーモード**」を ON。
3. 「**パッケージ化されていない拡張機能を読み込む**」をクリック。
4. このフォルダ（`D:\SNSBlocker`）を選択。
5. YouTube の動画を開いて動作確認。

## アーキテクチャ（基盤 / クイズ の分離）

将来、書き取り以外の形式（将棋の次の一手・詰将棋、ソルフェージュの聴音・リズム 等）にも
対応できるよう、**基盤部分**と**クイズ部分**を分離しています。基盤は「どの形式か」を一切知らず、
`config.js` の `activeQuiz` で選ばれたクイズに出題を委譲します。

```
core/registry.js   基盤: クイズを登録・選択するレジストリ（window.Kansho）
core/ui.js         基盤: 形式非依存の共有UI部品（el / コピペ禁止 / 進捗ヘッダ）
core/host.js       基盤: YouTube関所（動画検知・オーバーレイ・ロック管理・クリア後画面）
core/overlay.css   基盤: 共通スタイル（オーバーレイ/カード/ヘッダ/ボタン/進捗ドット）
config.js          どの形式を出すか（Kansho.config.activeQuiz）
continue.html/js   基盤: 継続ページ
quizzes/
  dictation/
    passages.js    クイズ: 書き取りのデータ（古典文学）
    dictation.js   クイズ: 書き取りの出題ロジック（採点＝正規化・diff もここに閉じる）
    dictation.css  クイズ: 書き取り固有のスタイル（本文/署名/入力欄/ぼかし/diff/ゲージ）
```

- **フォーク運用**するなら、`quizzes/` に目的の形式だけを残し、`config.js` の `activeQuiz` を
  その id にする。基盤（`core/`）は変更不要。
- **拡張機能内で切り替える**なら、複数のクイズを登録したうえで `config.js` を
  `chrome.storage` 等から読むように差し替える。`core/host.js` / `continue.js` は変更不要。

### 新しいクイズ形式を追加する

1. `quizzes/<形式名>/` を作り、その中で `Kansho.registerQuiz({ ... })` を呼ぶスクリプトを書く。

   ```js
   Kansho.registerQuiz({
     id: "shogi",            // config.activeQuiz と対応
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
2. `manifest.json` の `content_scripts.js` / `content_scripts.css` / `web_accessible_resources`、
   および `continue.html` の `<script>`・`<link>` に、追加したファイルを（JSは `config.js` の後・
   `core/host.js` の前、CSSは `core/overlay.css` の後に）登録する。
3. `config.js` の `activeQuiz` を新しい id に変えると、その形式で出題される。

## 仕様メモ

- 解除状態は **タブのセッション中のみ**保持（`sessionStorage`）。タブを閉じて開き直すと再度出題されます。動画ごとに個別に判定します。
- 空白の揺れ（改行・連続スペース・前後の空白）は許容し、それ以外は 1 文字単位で厳密に判定します。
- コピー・ペースト・右クリック・ドラッグは課題エリア内で無効化しています（自制のためのツールなので、完全な回避防止は目的としていません）。

## 難易度の調整

- 文章を長く／短くする → `quizzes/dictation/passages.js` の各 `segments` を編集。
- 問題数を変える → `segments` の数を増減する（出題数＝`segments` の数）。長い範囲を課したい作品は 4 分割・5 分割…と増やせばよい。
