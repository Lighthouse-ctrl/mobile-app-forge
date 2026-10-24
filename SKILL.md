---
name: mobile-app-forge
description: 开发并交付可安装的安卓手机 APP 的完整流程：先做移动端网页（单页、本地存储），用无头浏览器截图验收，再用 Capacitor 6 打包成带图标/启动页的签名 APK 并交付到手机。当用户说 开发手机APP、做个APP、写个安卓应用、打包APK、生成安装包、PWA 转 APK、Capacitor 打包、手机软件、记录类APP、帮我做个手机应用 时使用。也用于修改这类已建好的应用并重新出包（如 lemon-water-android）。
---

# 手机 APP 开发（网页 UI + Capacitor → 签名 APK）

本机已具备完整工具链，按固定流程执行，不要临时改用其他框架。

## 流程总览（固定 5 步）

0. **需求确认**：平台（默认安卓 APK）、页面、数据项、是否需要提醒/联网。一次问清，避免反复。
1. **先做网页版**：在 `C:\opencode\<项目名>` 做移动优先单页应用（纯 HTML/CSS/JS，无框架、无 CDN、可离线）。
2. **截图验收**：用 `scripts/qa-mobile.mjs` 在 390x844 / 375x667 / 430x932 渲染并截图，检查溢出、遮挡、空状态，按参考图迭代。
3. **包装安卓**：复制网页到 `C:\opencode\<项目名>-android\www`，Capacitor 6 生成 `android/`，配图标、启动页、状态栏、返回键。
4. **构建交付**：`scripts/build-apk.ps1` 生成并签名 APK，`apksigner verify` + `aapt2 dump badging` 校验，复制到桌面和局域网下载目录。

UI 完成不等于交付完成；必须产出可安装 APK 并给出安装方式。

## 已装工具链（先探测，缺失再装）

| 组件 | 路径/版本 |
| --- | --- |
| JDK | `D:\Android\tools\jdk17`（Temurin 17） |
| Android SDK | `D:\Android\sdk`（platform-tools、android-34、build-tools 34.0.0） |
| Gradle 缓存 | `D:\Android\gradle-home` |
| Node / npm | 已装（需 20+） |
| Capacitor | 6.2.2（JDK 17 + targetSdk 34，规避 Android 15 强制沉浸式） |
| 参考实现 | 网页 `C:\opencode\lemon-water`、安卓 `C:\opencode\lemon-water-android` |

探测：
```powershell
Test-Path 'D:\Android\tools\jdk17\bin\java.exe'; Test-Path 'D:\Android\sdk\platforms\android-34'
```
缺失时按 `references/windows-toolchain.md` 安装（已含镜像地址，GitHub 直连很慢）。

构建环境变量（每次构建都要设）：
```powershell
$env:JAVA_HOME='D:\Android\tools\jdk17'
$env:ANDROID_HOME='D:\Android\sdk'
$env:ANDROID_SDK_ROOT='D:\Android\sdk'
$env:GRADLE_USER_HOME='D:\Android\gradle-home'
```

## 第 1 步：网页版实现规范

- 设计基准 390x844，`max-width:480px` 居中；支持 `env(safe-area-inset-*)`，`100dvh`，`viewport-fit=cover`。
- 样式集中在 `styles.css`：CSS 变量管颜色，圆角卡片 + 柔和阴影，`@media (max-height:700px)` 压缩短屏，保证主操作按钮在首屏可见。
- 插画/图标全部内联 SVG（杯子、瓶子、日历等），不引外部图片和字体。
- 数据：`localStorage` 单 key（如 `lemon-water-v1`）+ 版本化，结构 `{goal, cup, records:[{id,ts,ml,type}]}`；日期按本地时区 `YYYY-MM-DD` 聚合。
- 交互：底部 tab 切页、底部弹层（sheet）、抽屉设置、toast、撤销、删除确认、演示数据、导入/导出 JSON。
- 统计口径写清楚（日均、达标率、连续天数、平均每次），空数据要有空状态文案。
- 可选 PWA：`manifest.webmanifest` + `sw.js`（cache 名随版本递增），但 APK 内必须跳过 SW 注册。

## 第 2 步：截图验收

`scripts/qa-mobile.mjs` 用无头 Edge + CDP 截图并收集 JS 错误、横向溢出：

```powershell
node "$env:USERPROFILE\.config\opencode\skills\mobile-app-forge\scripts\qa-mobile.mjs" --config qa.json
```

`qa.json` 示例见 `templates/qa.example.json`：可配置多视口、多步骤（点 tab、填表单）与输出目录。每步截图后用 Read 工具查看，再改样式；不要凭感觉交付。

必须检查：
- `document.documentElement.scrollWidth === innerWidth`（无横向滚动）
- 首屏能看到主按钮；底部 tab 不遮挡内容
- 空状态、长文本、4 位数数值（如 60350 ml）不换行错位
- 短屏 375x667 时内容可滚动且主按钮可见

## 第 3 步：Capacitor 包装

项目结构：
```
<项目>-android\
  www\            # 从网页项目复制的产物（index/styles/app/manifest/icons）
  assets\         # icon-only.png / icon-foreground.png / icon-background.png / splash.png
  capacitor.config.json
  package.json
  android\        # cap add android 生成
```

1. 复制网页产物到 `www/`（不要复制 `sw.js`）。
2. `package.json` 依赖（版本已验证）：`@capacitor/core|android|cli 6.2.2`、`@capacitor/app 6.0.3`、`@capacitor/filesystem 6.0.4`、`@capacitor/share 6.0.4`、`@capacitor/assets 3.0.5`。
3. 写 `capacitor.config.json`：`appId`、`appName`（可中文）、`webDir: "www"`、`backgroundColor`。
4. `npm install --no-audit --no-fund` → `npx cap add android`。
5. 生成图标/启动页：`scripts/make-app-assets.py` 出 `assets/*.png`，再 `npx capacitor-assets generate --android`。
6. 原生适配按 `references/native-integration.md`：状态栏配色、竖屏、返回键、导出/导入、SW 跳过、版本号。
7. 签名文件放 `android/keystore/`，`android/keystore.properties` 记录 4 项，`app/build.gradle` 读入 signingConfig。首次生成的 keystore 和密码必须保留（升级覆盖安装依赖它）。

## 第 4 步：构建与交付

```powershell
& "$env:USERPROFILE\.config\opencode\skills\mobile-app-forge\scripts\build-apk.ps1" `
  -AppDir 'C:\opencode\<项目>-android'
```

脚本完成：BOM 修复 → `cap sync` → `assembleRelease` → apksigner 校验 → 复制到桌面和局域网目录 → 打印版本/大小。首次构建约 5 分钟（下载依赖），增量约 20 秒。

交付时给出：
- APK 路径（桌面 + `C:\opencode\<项目>\<名>.apk`）
- 手机安装步骤（允许未知来源；覆盖安装保留数据）
- 局域网下载地址 `http://<本机WLAN IP>:8765/<名>.apk`（网页服务已在该目录）
- 数据位置与备份方式（App 内导出 JSON）

## 每次改功能后的标准动作

1. 改网页项目（单一真源），删除旧缓存版本号（`sw.js` cache 递增）。
2. `node --check app.js`，跑截图验收。
3. 复制到 `www/` → `npx cap sync android`。
4. `versionCode +1`、`versionName` 递增（同一 keystore，覆盖安装不丢数据）。
5. `build-apk.ps1` → 校验 → 覆盖桌面 APK。

## 高频踩坑（务必遵守）

- **PowerShell 写文件**：`Set-Content -Encoding UTF8` 会带 BOM，`build.gradle` 会报 `Unexpected character: '?' @ line 1`。用 edit 工具，或 `[IO.File]::WriteAllText($p,$t,(New-Object Text.UTF8Encoding($false)))`。
- **gradle-wrapper.properties**：URL 必须写成 `https\://host/...`（一个反斜杠），写成 `https\\://` 会报 `Illegal character in scheme name`；用腾讯镜像 `https://mirrors.cloud.tencent.com/gradle/gradle-8.2.1-bin.zip`，不要用 `-all`。
- **盘符空间**：C 盘紧张时全部放 D（JDK/SDK/GRADLE_USER_HOME）。
- **GitHub 直连慢**：JDK 用清华 Adoptium 镜像，Gradle 用腾讯镜像；Maven/Google 仓库实测可达。
- **SDK 许可**：`sdkmanager --licenses` 需管道多行 `y`，否则安装静默失败。
- **Gradle 控制台中文**是系统编码问题，出现「ע:」不影响构建；只看 `BUILD SUCCESSFUL`。
- **图标**：`capacitor-assets` 默认给前后景加 16.7% inset；自定义前景已留白时，删掉 `mipmap-anydpi-v26/ic_launcher*.xml` 里的 inset，否则图标过小。
- **APK 校验**：`aapt2 dump badging` 看包名/版本/最低 SDK；`apksigner verify --print-certs` 看签名；两者都通过再交付。
- **iOS**：Windows 无法打包 iOS，用户要 iOS 时说明需 Mac + Xcode，或先给 PWA。

## 资源

- `scripts/build-apk.ps1`：一键同步、构建、签名校验、复制
- `scripts/qa-mobile.mjs`：CDP 多视口截图 + 错误/溢出检测
- `scripts/make-app-assets.py`：由一张 1024 图标生成安卓图标/启动页素材
- `references/windows-toolchain.md`：工具链安装与镜像
- `references/native-integration.md`：返回键、导出分享、状态栏、版本号、SW 跳过
- `templates/package.json`、`templates/capacitor.config.json`、`templates/qa.example.json`
