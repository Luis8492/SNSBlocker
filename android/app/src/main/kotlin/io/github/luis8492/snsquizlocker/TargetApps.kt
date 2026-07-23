package io.github.luis8492.snsquizlocker

// 対象SNSアプリの一覧。Chrome 拡張の core/sites.js（サイトアダプタ）に相当する。
// 1エントリ＝設定画面の1チェックボックス。パッケージ名は本体/Lite/地域別を束ねる。
object TargetApps {
    data class App(val key: String, val label: String, val packages: List<String>)

    val ALL = listOf(
        App("youtube", "YouTube", listOf("com.google.android.youtube")),
        App("x", "X (Twitter)", listOf("com.twitter.android")),
        App("facebook", "Facebook", listOf("com.facebook.katana", "com.facebook.lite")),
        App("instagram", "Instagram", listOf("com.instagram.android", "com.instagram.lite")),
        App("tiktok", "TikTok", listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill")),
        App("reddit", "Reddit", listOf("com.reddit.frontpage")),
    )

    fun packagesFor(keys: Set<String>): Set<String> =
        ALL.filter { it.key in keys }.flatMap { it.packages }.toSet()
}
