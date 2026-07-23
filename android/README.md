# SNSQuizLocker — Android 版

SNSアプリの起動を検知し、クイズに全問正解するまでブロックするネイティブアプリ。
ブラウザ拡張と違い、対象は**ネイティブのSNSアプリ**（YouTube・X・Instagram など）。

## 使い方（アプリの流れ）

1. アプリを起動 → 設定画面（MainActivity）で2つの権限を許可する:
   - **使用状況へのアクセス**（前面アプリの検知に必要）
   - **他のアプリの上に表示**（バックグラウンドからクイズ画面を出すのに必要）
2. 「SNSアプリの監視」をON → 常駐サービス（WatchdogService）が開始。
3. 対象SNSアプリを開くと全画面のクイズ関所（QuizActivity）が出る。
4. 全問正解 → 「もっと続ける!!!」か「**N分だけ**ソーシャルネットワークへ進む」。
   戻るボタン＝諦めてホームへ（SNSには戻れない）。

## 構成

ネイティブ層は「検知とブロック」だけの薄い殻。クイズ本体は
`../extension/core/` と `../extension/quizzes/` の Web 資産を **WebView** で動かす。
ビルド時に Gradle の `syncWebAssets` タスクが assets へコピーする
（**android/ 内にクイズコードを複製しないこと。extension/ が単一ソース**）。

```
app/src/main/kotlin/io/github/luis8492/snsquizlocker/
  MainActivity.kt      設定画面（権限・監視ON/OFF・対象アプリ・クイズ・解除時間・テスト起動）
  WatchdogService.kt   前面アプリ監視（UsageStatsManager ポーリング、800ms周期）
  QuizActivity.kt      クイズ関所（全画面WebView + JSブリッジ KanshoNative）
  Prefs.kt             設定と時限解除の保存（SharedPreferences）
  TargetApps.kt        対象SNSアプリの一覧（key → パッケージ名の束）
app/src/main/assets/web/
  index.html           WebViewエントリ（continue.html と同じ読み込み順）
  native-config.js     config.js の代替（JSブリッジから有効クイズを受け取る）
  native-host.js       host.js/continue.js の代替（出題ループ＋クリア後の2択）
```

### Chrome 拡張との対応関係

| 拡張機能 | Android |
|---|---|
| `core/host.js`（関所・検知） | WatchdogService + QuizActivity |
| `core/sites.js`（サイトアダプタ） | TargetApps.kt（パッケージ名リスト） |
| `config.js` + `chrome.storage.sync` | Prefs.kt（SharedPreferences）+ JSブリッジ |
| `sessionStorage`（タブ内解除） | 時限解除（既定10分、1〜120分で設定可） |
| `options.html`（選択パネル） | MainActivity |
| `continue.html`（継続ページ） | クリア後の「もっと続ける!!!」で兼ねる |

### JSブリッジ（window.KanshoNative）

| メソッド | 役割 |
|---|---|
| `getEnabledQuizzes(): String` | 有効クイズ id の JSON 配列 |
| `getUnlockMinutes(): Int` | 解除時間（分） |
| `unlock()` | 解除を記録して関所を閉じる（テスト起動時は記録しない） |

ブリッジが無い環境でも動くので、`index.html` は PC ブラウザで直接開いて
クイズの動作確認ができる（その場合は全クイズからランダム・解除ボタンは無反応）。

## ビルド

```
cd android
gradlew.bat assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
```

- 要 JDK 17+ と Android SDK（`local.properties` の `sdk.dir`、gitには含めない）。
  Android Studio で `android/` フォルダを開いてもよい。
- 依存ライブラリなし（フレームワークAPIのみ、AppCompat 不使用）。
- 実機インストール: `adb install app/build/outputs/apk/debug/app-debug.apk`

## 設計メモ・注意

- 検知は AccessibilityService を使わない（Play ポリシー審査が厳しく、この用途では不要）。
- Android 10+ でバックグラウンドから Activity を起動するために
  SYSTEM_ALERT_WINDOW（他のアプリの上に表示）の許可を前提にしている。
- 常駐は FGS（foregroundServiceType="specialUse"）。Play 提出時に用途申告が必要。
- 端末再起動後はアプリを一度開くと監視が再開する（MainActivity.onResume で復帰。
  BOOT_COMPLETED での自動復帰は未実装 = TODO）。
- Play 公開時: 使用状況へのアクセス（PACKAGE_USAGE_STATS）の申告フォームで
  デジタルウェルビーイング用途と説明する。
