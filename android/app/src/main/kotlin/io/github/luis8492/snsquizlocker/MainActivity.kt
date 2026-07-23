package io.github.luis8492.snsquizlocker

import android.Manifest
import android.app.Activity
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

// 設定画面。Chrome 拡張の options.html（選択パネル）に相当する。
// 依存を増やさないため、レイアウトはコードで組む（AppCompat 不使用）。
class MainActivity : Activity() {

    private lateinit var usageStatus: TextView
    private lateinit var overlayStatus: TextView
    private lateinit var watchSwitch: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        val pad = dp(16)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }

        fun section(title: String) {
            root.addView(TextView(this).apply {
                text = title
                textSize = 16f
                setTypeface(null, Typeface.BOLD)
                setPadding(0, pad, 0, dp(4))
            })
        }

        // ---- 1. 権限 --------------------------------------------------------
        section("1. 権限（両方必要）")
        usageStatus = TextView(this)
        root.addView(usageStatus)
        root.addView(Button(this).apply {
            text = "使用状況へのアクセスを許可する"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        })
        overlayStatus = TextView(this)
        root.addView(overlayStatus)
        root.addView(Button(this).apply {
            text = "他のアプリの上に表示を許可する"
            setOnClickListener {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            }
        })

        // ---- 2. 監視 --------------------------------------------------------
        section("2. 監視")
        watchSwitch = Switch(this).apply {
            text = "SNSアプリの監視を有効にする"
            isChecked = Prefs.watchdogEnabled(this@MainActivity)
            setOnCheckedChangeListener { _, on ->
                if (on && !(hasUsageAccess() && Settings.canDrawOverlays(this@MainActivity))) {
                    isChecked = false
                    Toast.makeText(
                        this@MainActivity,
                        "先に上の2つの権限を許可してください", Toast.LENGTH_LONG
                    ).show()
                    return@setOnCheckedChangeListener
                }
                Prefs.setWatchdogEnabled(this@MainActivity, on)
                val svc = Intent(this@MainActivity, WatchdogService::class.java)
                if (on) startForegroundService(svc) else stopService(svc)
            }
        }
        root.addView(watchSwitch)

        // ---- 3. 対象アプリ --------------------------------------------------
        section("3. ロックするSNSアプリ")
        val appKeys = Prefs.enabledAppKeys(this).toMutableSet()
        TargetApps.ALL.forEach { app ->
            root.addView(CheckBox(this).apply {
                text = app.label
                isChecked = app.key in appKeys
                setOnCheckedChangeListener { _, on ->
                    if (on) appKeys.add(app.key) else appKeys.remove(app.key)
                    Prefs.setEnabledAppKeys(this@MainActivity, appKeys)
                }
            })
        }

        // ---- 4. 出題クイズ --------------------------------------------------
        section("4. 出題するクイズ")
        val quizIds = Prefs.enabledQuizzes(this).toMutableSet()
        Prefs.ALL_QUIZZES.forEach { (id, label) ->
            root.addView(CheckBox(this).apply {
                text = label
                isChecked = id in quizIds
                setOnCheckedChangeListener { _, on ->
                    if (!on && quizIds.size == 1 && id in quizIds) {
                        isChecked = true // 最低1つは残す（拡張の選択パネルと同じ制約）
                        Toast.makeText(
                            this@MainActivity, "最低1つは選んでください", Toast.LENGTH_SHORT
                        ).show()
                        return@setOnCheckedChangeListener
                    }
                    if (on) quizIds.add(id) else quizIds.remove(id)
                    Prefs.setEnabledQuizzes(this@MainActivity, quizIds)
                }
            })
        }

        // ---- 5. 解除時間 ----------------------------------------------------
        section("5. 正解後の解除時間（分）")
        root.addView(EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(Prefs.unlockMinutes(this@MainActivity).toString())
            layoutParams = ViewGroup.LayoutParams(dp(96), ViewGroup.LayoutParams.WRAP_CONTENT)
            addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) {
                    val v = s?.toString()?.toIntOrNull() ?: return
                    Prefs.setUnlockMinutes(this@MainActivity, v)
                }
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            })
        })

        // ---- 6. 動作テスト --------------------------------------------------
        section("6. 動作テスト")
        root.addView(Button(this).apply {
            text = "クイズ画面を試す（解除は記録されない）"
            setOnClickListener {
                startActivity(
                    Intent(this@MainActivity, QuizActivity::class.java)
                        .putExtra(QuizActivity.EXTRA_TEST, true)
                )
            }
        })

        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() {
        super.onResume()
        usageStatus.text =
            if (hasUsageAccess()) "✓ 使用状況へのアクセス: 許可済み"
            else "✗ 使用状況へのアクセス: 未許可"
        overlayStatus.text =
            if (Settings.canDrawOverlays(this)) "✓ 他のアプリの上に表示: 許可済み"
            else "✗ 他のアプリの上に表示: 未許可"
        // 権限が揃っていて有効設定なら、サービスを起動し直す（再起動後の復帰を兼ねる）
        if (Prefs.watchdogEnabled(this) && hasUsageAccess() && Settings.canDrawOverlays(this)) {
            startForegroundService(Intent(this, WatchdogService::class.java))
        }
    }

    private fun hasUsageAccess(): Boolean {
        val aom = getSystemService(AppOpsManager::class.java)
        @Suppress("DEPRECATION")
        val mode = aom.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(), packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED ||
            (mode == AppOpsManager.MODE_DEFAULT &&
                checkSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) ==
                    PackageManager.PERMISSION_GRANTED)
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
