package io.github.luis8492.snsquizlocker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

// 前面アプリの監視サービス。Chrome 拡張の core/host.js（関所の検知部分）に相当する。
// UsageStatsManager のイベントを短周期でポーリングし、対象SNSアプリが前面に来たら
// QuizActivity（関所）を起動する。ブロックの実体は QuizActivity 側。
class WatchdogService : Service() {

    companion object {
        private const val CHANNEL_ID = "watchdog"
        private const val NOTIFICATION_ID = 1
        private const val POLL_MS = 800L        // 前面アプリの確認間隔
        private const val RELAUNCH_GUARD_MS = 3000L // 起動直後の二重起動を防ぐ猶予
    }

    private val handler = Handler(Looper.getMainLooper())
    private var lastLaunch = 0L

    private val tick = object : Runnable {
        override fun run() {
            try {
                check()
            } catch (_: Exception) {
                // 権限が剥奪された等。落とさず次の周期で再試行する。
            }
            handler.postDelayed(this, POLL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "監視", NotificationManager.IMPORTANCE_MIN)
        )
        val notification: Notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle("SNSQuizLocker が監視中")
            .setContentText("対象のSNSアプリを開くとクイズが出ます")
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        handler.post(tick)
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    private fun check() {
        val now = System.currentTimeMillis()
        if (now - lastLaunch < RELAUNCH_GUARD_MS) return
        val fg = foregroundPackage(now) ?: return
        if (fg == packageName) return                          // 自分（クイズ表示中）は対象外
        if (fg !in Prefs.watchedPackages(this)) return         // 監視対象でない
        if (Prefs.isUnlocked(this, fg)) return                 // 時限解除中
        lastLaunch = now
        // バックグラウンドからの Activity 起動は「他のアプリの上に表示」許可が前提
        startActivity(
            Intent(this, QuizActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(QuizActivity.EXTRA_PACKAGE, fg)
        )
    }

    // 直近のイベントから現在の前面アプリのパッケージ名を求める。
    private fun foregroundPackage(now: Long): String? {
        val usm = getSystemService(UsageStatsManager::class.java)
        val events = usm.queryEvents(now - 10_000, now)
        var pkg: String? = null
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            // ACTIVITY_RESUMED(API29+) は MOVE_TO_FOREGROUND と同値。両対応のため両方見る。
            if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                e.eventType == UsageEvents.Event.ACTIVITY_RESUMED
            ) {
                pkg = e.packageName
            }
        }
        return pkg
    }
}
