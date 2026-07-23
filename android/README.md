# SNSQuizLocker — Android 版（開発中）

SNSアプリの起動を検知し、クイズに全問正解するまでブロックするネイティブアプリ。
ブラウザ拡張と違い、対象は**ネイティブのSNSアプリ**（YouTube・X・Instagram など）。

## 設計方針

ネイティブ層は「検知とブロック」だけの薄い殻にし、クイズ本体は
`../extension/core/` と `../extension/quizzes/` の Web 資産を **WebView** で動かす。

```
検知   : UsageStatsManager（使用状況へのアクセス）で前面アプリをポーリング
ブロック: 対象SNSアプリが前面に来たら、フルスクリーンのクイズActivityを起動
クイズ  : WebView に extension/ のクイズ資産を読み込む（ビルド時に Gradle タスクで
          assets/ へコピーする。android/ 内にクイズコードを複製しないこと）
解除    : 「タブを閉じるまで」に相当する概念がないため「N分間解除」に置き換える
ネイティブ⇔JS 連携: JavascriptInterface（クリア通知・設定の受け渡し）
```

## Chrome 拡張との対応関係

| 拡張機能 | Android |
|---|---|
| `core/host.js`（関所） | ネイティブの検知サービス + クイズActivity |
| `core/sites.js`（サイトアダプタ） | 対象アプリのパッケージ名リスト |
| `config.js` + `chrome.storage.sync` | SharedPreferences / DataStore |
| `sessionStorage`（タブ内解除） | 時限解除（N分） |
| `options.html`（選択パネル） | ネイティブの設定画面 |
| `continue.html`（継続ページ） | クイズActivity 内でそのまま流用 |

## ストア公開時の注意

- 使用状況へのアクセス（PACKAGE_USAGE_STATS）は Google Play で申告が必要。
  デジタルウェルビーイング用途として正当化できる。
- AccessibilityService は使わない（ポリシー審査が厳しく、この用途では不要）。
