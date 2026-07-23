package io.github.luis8492.snsquizlocker

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray

// クイズ関所（全画面 WebView）。Chrome 拡張のオーバーレイに相当する。
// extension/ からコピーされた assets/web/ のクイズ資産を読み込み、
// JS ブリッジ（KanshoNative）でクリア通知と設定の受け渡しを行う。
class QuizActivity : Activity() {

    companion object {
        const val EXTRA_PACKAGE = "package" // ゲートを発動させたSNSアプリ（解除の対象）
        const val EXTRA_TEST = "test"       // 設定画面からの動作テスト（解除を記録しない）
    }

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val targetPackage = intent.getStringExtra(EXTRA_PACKAGE)
        val isTest = intent.getBooleanExtra(EXTRA_TEST, false)

        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        // 聴音系クイズ（juon/senritsu）の WebAudio 再生をボタン操作で確実に鳴らす
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.addJavascriptInterface(Bridge(targetPackage, isTest), "KanshoNative")
        web.loadUrl("file:///android_asset/web/index.html")
        setContentView(web)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    // 戻る＝諦めてホームへ。SNSアプリに戻すと即再出題でループになるため、
    // 「解きたくなければ（SNSごと）閉じるだけ」という拡張の思想に合わせる。
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    // WebView（native-config.js / native-host.js）から呼ばれる連携窓口
    inner class Bridge(private val targetPackage: String?, private val isTest: Boolean) {

        @JavascriptInterface
        fun getEnabledQuizzes(): String =
            JSONArray(Prefs.enabledQuizzes(this@QuizActivity).toList()).toString()

        @JavascriptInterface
        fun getUnlockMinutes(): Int = Prefs.unlockMinutes(this@QuizActivity)

        // 全問クリア後に「N分だけ進む」が押された。解除を記録して SNS アプリへ戻る。
        @JavascriptInterface
        fun unlock() {
            runOnUiThread {
                if (!isTest && targetPackage != null) {
                    Prefs.unlock(
                        this@QuizActivity, targetPackage,
                        Prefs.unlockMinutes(this@QuizActivity)
                    )
                }
                finish()
            }
        }
    }
}
