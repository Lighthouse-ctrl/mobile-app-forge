# Windows 安卓构建工具链（已验证）

目标：Windows 10/11 + Node 20+，用 Capacitor 6 打包自包含 APK，不依赖 Android Studio。
默认全部装在 D 盘（C 盘空间常紧张），预计占用 ~2.5 GB。

## 1. JDK 17（Temurin）

GitHub（Adoptium 官方下载）在国内经常只有几十 KB/s，用清华镜像：

```powershell
New-Item -ItemType Directory -Force -Path 'D:\Android\tools','D:\Android\dl','D:\Android\sdk','D:\Android\gradle-home' | Out-Null
& curl.exe -L --fail --retry 2 --silent --show-error -o 'D:\Android\dl\jdk17.zip' `
  'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip'
& tar.exe -xf 'D:\Android\dl\jdk17.zip' -C 'D:\Android\tools'
Rename-Item 'D:\Android\tools\jdk-17.0.20.1+1' 'jdk17'
& 'D:\Android\tools\jdk17\bin\java.exe' -version
```

目录名会随版本变化，解压后按实际名称重命名为 `jdk17`。

## 2. Android 命令行工具

```powershell
& curl.exe -L --fail --retry 3 --silent --show-error -o 'D:\Android\dl\cmdline-tools.zip' `
  'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
New-Item -ItemType Directory -Force -Path 'D:\Android\sdk\cmdline-tools' | Out-Null
& tar.exe -xf 'D:\Android\dl\cmdline-tools.zip' -C 'D:\Android\sdk\cmdline-tools'
Move-Item 'D:\Android\sdk\cmdline-tools\cmdline-tools' 'D:\Android\sdk\cmdline-tools\latest'
```

必须是 `sdk\cmdline-tools\latest\bin\sdkmanager.bat` 这个层级。

## 3. 许可 + SDK 包

```powershell
$env:JAVA_HOME='D:\Android\tools\jdk17'
$env:ANDROID_HOME='D:\Android\sdk'
$env:ANDROID_SDK_ROOT='D:\Android\sdk'
$y = ("y`r`n" * 40)
$y | & 'D:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat' --licenses
$y | & 'D:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat' --sdk_root='D:\Android\sdk' `
  'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'
```

许可不接受时安装会失败或卡住；最后一行应出现 `All SDK package licenses accepted`。

## 4. Gradle 镜像

Capacitor 6 的 wrapper 默认下载 `gradle-8.2.1-all.zip`，走 GitHub 很慢。改为腾讯镜像的 `-bin`：

`android/gradle/wrapper/gradle-wrapper.properties`
```properties
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.2.1-bin.zip
networkTimeout=120000
```

注意反斜杠只有 **一个**：`https\://`。写成 `https\\://` 会报
`Illegal character in scheme name at index 5`。

## 5. 环境变量（每次构建）

```powershell
$env:JAVA_HOME='D:\Android\tools\jdk17'
$env:ANDROID_HOME='D:\Android\sdk'
$env:ANDROID_SDK_ROOT='D:\Android\sdk'
$env:GRADLE_USER_HOME='D:\Android\gradle-home'
```

不要全局改 `JAVA_HOME`（可能影响其他项目已有的 JDK 8）。

## 6. 版本组合（已验证兼容）

| 项 | 值 |
| --- | --- |
| Capacitor | 6.2.2（不要 7，7 需要 JDK 21 / SDK 35） |
| @capacitor/app | 6.0.3 |
| @capacitor/filesystem | 6.0.4 |
| @capacitor/share | 6.0.4 |
| @capacitor/assets | 3.0.5 |
| JDK | 17 |
| compileSdk / targetSdk | 34 |
| minSdk | 22（Capacitor 默认，覆盖 Android 7+） |
| Gradle / AGP | 8.2.1 / 8.2.1 |

targetSdk 34 还有一个好处：Android 15 不会强制 edge-to-edge，网页内容自然落在状态栏下方，不需要额外处理 safe-area。

## 7. 首次构建耗时

- `npm install`：约 4 分钟（199 个包）。
- Gradle 首次：下载 122 MB 发行包 + 依赖，约 5 分钟。
- 之后增量构建：15–20 秒。

## 8. 环境自检

```powershell
Test-Path 'D:\Android\tools\jdk17\bin\java.exe'
Test-Path 'D:\Android\sdk\platforms\android-34'
Test-Path 'D:\Android\sdk\build-tools\34.0.0\apksigner.bat'
& 'D:\Android\sdk\build-tools\34.0.0\aapt2.exe' version
```

## 9. 常见报错对照

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `Unexpected character: '?' @ line 1` | build.gradle 带 UTF-8 BOM | 用无 BOM UTF-8 重写；见 SKILL 踩坑 |
| `Illegal character in scheme name` | wrapper URL 反斜杠重复 | 改成 `https\://` |
| `Could not load wrapper properties` | 同上 | 同上 |
| `sdkmanager` 秒退 | 未设 JAVA_HOME / 许可未接受 | 重跑许可 |
| 下载 JDK 卡住 | GitHub 限速 | 用清华镜像 |
| `maven.google.com` HEAD 超时 | 该地址不支持目录探测 | 用具体 `.pom` 地址测试，构建正常 |
| Gradle 输出「ע: ...」 | 控制台编码 | 忽略，看 `BUILD SUCCESSFUL` |

## 10. 不需要的东西

- 不需要 Android Studio。
- 不需要模拟器（网页阶段已验收 UI；真机安装验证更可靠）。
- 不需要 Play 商店账号（自用 APK 直接侧载）。
