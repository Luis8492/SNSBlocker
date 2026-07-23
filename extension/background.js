// SNSQuizLocker — バックグラウンド（service worker）。
// 役割はインストール直後の導入だけ: 設定パネルを開いて
// 「何がどこで出題されるか」を最初に見せる（いきなりブロックされて驚かせない）。
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});
