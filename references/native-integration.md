# Capacitor 原生适配清单（Android）

网页在没有 `window.Capacitor` 时行为不变，原生里才启用以下能力。

## 1. 判定与插件取用

```js
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativePlugin = (name) => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
```

## 2. 跳过 Service Worker

APK 内页面来自 `https://localhost`，SW 会缓存旧版本，导致升级后仍是旧界面：

```js
function registerSW() {
  if (isNative()) return;
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
```

## 3. 安卓返回键

位于根页面时退出，其它情况先关弹层、再回首页：

```js
function initNative() {
  if (!isNative()) return;
  const App = nativePlugin('App');
  if (!App) return;
  App.addListener('backButton', () => {
    if (document.querySelector('.overlay.is-open') || document.querySelector('.sheet.is-open') || document.querySelector('#drawer.is-open')) {
      closePanels();
      return;
    }
    if (view.screen !== 'drink') { go('drink'); return; }
    App.exitApp();
  });
}
```

## 4. 导出 JSON（缓存目录 + 系统分享）

WebView 里 `<a download>` 不可靠，改用 Filesystem 写缓存再调 Share：

```js
if (isNative() && nativePlugin('Filesystem')) {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  const res = await nativePlugin('Filesystem').writeFile({
    path: filename, data: btoa(bin), directory: 'CACHE',
  });
  await nativePlugin('Share').share({
    title: '备份', text: filename, files: [res.uri], dialogTitle: '保存或发送备份文件',
  });
}
```

网页端仍走 Blob 下载。注意 `btoa` 只能处理 Latin-1，必须先按 UTF-8 转字节再编码，否则中文内容会坏。

## 5. 导入 JSON

不需要插件：隐藏 `<input type="file" accept=".json,application/json">`，`FileReader.readAsText` 读取、校验 `records`、确认覆盖、`renderAll()`。

## 6. 状态栏与主题

`android/app/src/main/res/values/styles.xml`：

```xml
<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">
    <item name="android:statusBarColor">#EEF5FC</item>
    <item name="android:windowLightStatusBar">true</item>
    <item name="android:navigationBarColor">#FFFFFF</item>
    <item name="android:windowBackground">#EEF5FC</item>
</style>

<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="android:background">@drawable/splash</item>
    <item name="windowSplashScreenBackground">#EEF5FC</item>
    <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
    <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
</style>
```

状态栏颜色与网页顶部背景保持一致，避免出现色带。

## 7. 竖屏 + 键盘

`AndroidManifest.xml` 的 `<activity>`：

```xml
android:screenOrientation="portrait"
android:windowSoftInputMode="adjustResize"
```

## 8. 应用名与版本

- `res/values/strings.xml`：`app_name` / `title_activity_main` 用中文。
- 每次出包递增：`android/app/build.gradle` 的 `versionCode` 与 `versionName`。
- 同一个 keystore 覆盖安装才保留数据；丢失 keystore 无法升级，只能卸载重装（数据会丢）。

## 9. 签名

```powershell
$env:JAVA_HOME='D:\Android\tools\jdk17'
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore '...\android\keystore\app.keystore' -alias app `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass <密码> -keypass <密码> `
  -dname "CN=App, OU=Personal, O=Owner, L=Beijing, ST=Beijing, C=CN"
```

`android/keystore.properties`：
```properties
storeFile=../keystore/app.keystore
storePassword=<密码>
keyAlias=app
keyPassword=<密码>
```

`android/app/build.gradle`：
```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('keystore.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }
        }
    }
}
```

> PowerShell 修改 gradle 文件必须用无 BOM UTF-8，否则 Gradle 直接解析失败。

## 10. 图标与启动页

1. 准备一张 1024x1024 图标（PNG）。
2. `python scripts/make-app-assets.py --icon icon.png --bg "#EEF5FC" --bg2 "#CAE7FA" --out assets`
3. `npx capacitor-assets generate --android`
4. 若自定义前景已预留留白，删掉 `res/mipmap-anydpi-v26/ic_launcher*.xml` 中的 `inset="16.7%"`，否则图标只有原来约三分之二大。

自适应图标前景内容建议占画布 60–65%，避开系统裁切安全区。

## 11. 构建后校验

```powershell
& 'D:\Android\sdk\build-tools\34.0.0\apksigner.bat' verify --print-certs <apk>
& 'D:\Android\sdk\build-tools\34.0.0\aapt2.exe' dump badging <apk>
```

确认：包名、versionCode/versionName、`application-label`（中文正常）、签名指纹存在、无 `AndroidManifest` 合并错误。

## 12. 真机自测清单

- 冷启动：启动页不白屏，进入后状态栏配色一致。
- 记录数据 → 杀掉进程 → 重开仍在。
- 返回键：弹层 → 关弹层；统计/我 → 回首页；首页 → 退出。
- 导出：系统分享面板出现，能保存到文件/发给微信。
- 升级安装（versionCode+1）：数据保留。
- 断网：功能全部可用。
