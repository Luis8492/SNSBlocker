# SNSQuizLocker プライバシーポリシー / Privacy Policy

最終更新: 2026-07-22

## 日本語

SNSQuizLocker（以下「本拡張機能」）は、利用者のデータを一切収集・送信しません。

- **データ収集**: 本拡張機能は、閲覧履歴・入力内容・個人情報を含むいかなるデータも
  収集せず、開発者や第三者のサーバーへ送信しません。外部との通信は行いません。
- **設定の保存**: 出題プラグインと対象SNSの選択は、Chrome の `storage.sync` 領域に
  保存されます。これは Chrome がブラウザ設定の同期に使う仕組みであり、
  開発者がアクセスすることはできません。
- **一時データ**: クイズのロック解除状態は各タブの `sessionStorage` にのみ保持され、
  タブを閉じると消えます。
- **権限の用途**:
  - `storage` — 上記の設定保存のため。
  - 対象SNS（YouTube・X・Facebook・Instagram・TikTok・Reddit）上での
    コンテンツスクリプト実行 — 対象ページにクイズのオーバーレイを表示するため。
    ページの内容を読み取って外部に送ることはありません。
- **問い合わせ**: 本拡張機能のストアページに記載の連絡先までお願いします。

## English

SNSQuizLocker (the "Extension") does not collect or transmit any user data.

- **Data collection**: The Extension collects no data whatsoever — no browsing
  history, no input, no personal information — and communicates with no external
  servers.
- **Settings**: Your plugin/site selections are stored via Chrome's `storage.sync`,
  a browser-managed sync mechanism the developer cannot access.
- **Ephemeral data**: Quiz unlock state lives only in each tab's `sessionStorage`
  and disappears when the tab is closed.
- **Permissions**: `storage` is used for the settings above; content scripts on the
  target SNS domains exist solely to display the quiz overlay. Page content is
  never read for transmission.
- **Contact**: See the contact listed on the Extension's store page.
