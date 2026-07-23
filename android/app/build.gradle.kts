plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.luis8492.snsquizlocker"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.luis8492.snsquizlocker"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // クイズ資産（extension/ が単一ソース）をビルド時にコピーした生成 assets を追加する。
    // 静的な assets/web/（index.html・native-*.js）とマージされる。
    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
        }
    }
}

// extension/ のクイズ資産を WebView 用 assets へ同期する。
// android/ 側にクイズコードを複製しないこと（extension/ が単一ソース）。
val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    description = "extension/ の core/・quizzes/ を WebView 用 assets にコピーする"
    from(rootDir.resolve("../extension")) {
        include("core/**", "quizzes/**")
        exclude("**/README.md")
        // host.js は Chrome 拡張のゲート（chrome.* 依存）。Android では native-host.js が代替。
        exclude("core/host.js", "core/sites.js")
    }
    into(layout.buildDirectory.dir("generated/webAssets/web"))
}
tasks.named("preBuild") { dependsOn(syncWebAssets) }

dependencies {
    // 依存なし（フレームワーク API のみで構成。AppCompat も不使用）
}
