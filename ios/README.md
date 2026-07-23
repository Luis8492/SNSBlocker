# SNSQuizLocker — iOS 版（構想段階）

iOS は他アプリの上へのオーバーレイを許さないため、**Screen Time API**
（FamilyControls + ManagedSettings + DeviceActivity、iOS 16+）を使う。

## 想定する体験

1. 対象SNSアプリに「シールド」（ブロック画面）をかける
2. シールドのボタン → 本アプリが開く
3. 本アプリ内でクイズを解く（WKWebView で `../extension/` のクイズ資産を流用）
4. 全問正解 → ManagedSettings でシールドを N 分間解除

## 着手前に必要なもの

- Mac + Xcode + Apple Developer Program
- **FamilyControls entitlement の配布申請**（Apple の承認制。先に申請しておくこと）
- シールド画面のカスタマイズは静的表示+ボタン1つまで（対話的クイズは不可）という
  制約の確認 → クイズは必ず自アプリ内で解かせる構成にする
