package io.github.luis8492.snsquizlocker

import android.content.Context
import android.content.SharedPreferences

// 設定と解除状態の保存。
// Chrome 拡張の chrome.storage.sync（enabledQuizzes / enabledSites）に相当するのが settings、
// sessionStorage（タブ内解除）に相当するのが unlocks（こちらは「N分間の時限解除」に置き換え）。
object Prefs {
    // extension/quizzes/ が登録するクイズ id と対応（登録順）
    val ALL_QUIZZES = listOf(
        "koten" to "古典文学",
        "hyakunin" to "百人一首",
        "juon" to "重音(2音)",
        "senritsu" to "旋律聴音",
        "tsume" to "詰将棋(3手)",
        "tsume5" to "詰将棋(5手)",
        "tsume7" to "詰将棋(7手)",
    )

    private fun sp(c: Context): SharedPreferences =
        c.getSharedPreferences("settings", Context.MODE_PRIVATE)

    private fun unlocks(c: Context): SharedPreferences =
        c.getSharedPreferences("unlocks", Context.MODE_PRIVATE)

    // ---- 出題クイズ（未設定＝全クイズ。registry.js の既定と同じ） ----
    fun enabledQuizzes(c: Context): Set<String> =
        sp(c).getStringSet("enabledQuizzes", null)?.toSet()
            ?: ALL_QUIZZES.map { it.first }.toSet()

    fun setEnabledQuizzes(c: Context, ids: Set<String>) {
        sp(c).edit().putStringSet("enabledQuizzes", ids.toSet()).apply()
    }

    // ---- 対象アプリ（未設定＝YouTube のみ。拡張の既定と同じ） ----
    fun enabledAppKeys(c: Context): Set<String> =
        sp(c).getStringSet("enabledApps", null)?.toSet() ?: setOf("youtube")

    fun setEnabledAppKeys(c: Context, keys: Set<String>) {
        sp(c).edit().putStringSet("enabledApps", keys.toSet()).apply()
    }

    /** 監視対象のパッケージ名一覧（選択中のアプリを展開したもの） */
    fun watchedPackages(c: Context): Set<String> =
        TargetApps.packagesFor(enabledAppKeys(c))

    // ---- 解除時間（分） ----
    fun unlockMinutes(c: Context): Int = sp(c).getInt("unlockMinutes", 10)

    fun setUnlockMinutes(c: Context, minutes: Int) {
        sp(c).edit().putInt("unlockMinutes", minutes.coerceIn(1, 120)).apply()
    }

    // ---- 監視の有効/無効 ----
    fun watchdogEnabled(c: Context): Boolean = sp(c).getBoolean("watchdogEnabled", false)

    fun setWatchdogEnabled(c: Context, on: Boolean) {
        sp(c).edit().putBoolean("watchdogEnabled", on).apply()
    }

    // ---- 時限解除 ----
    fun isUnlocked(c: Context, pkg: String): Boolean =
        unlocks(c).getLong(pkg, 0L) > System.currentTimeMillis()

    fun unlock(c: Context, pkg: String, minutes: Int) {
        unlocks(c).edit()
            .putLong(pkg, System.currentTimeMillis() + minutes * 60_000L)
            .apply()
    }
}
