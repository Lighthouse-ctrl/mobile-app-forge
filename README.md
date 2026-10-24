# mobile-app-forge

把「做一个手机 App」变成一条固定流水线：**移动端网页 → 截图验收 → Capacitor 打包 → 签名 APK → 手机安装**。

这是给 [opencode](https://opencode.ai) 用的技能（Skill），已在本机完整跑通并产出过可安装的安卓 APK。

## 安装

把本仓库放到 opencode 的全局 skills 目录，文件夹名保持 `mobile-app-forge`：

```
%USERPROFILE%\.config\opencode\skills\mobile-app-forge
```

任选一种：

```powershell
git clone https://github.com/Lighthouse-ctrl/mobile-app-forge.git "$env:USERPROFILE\.config\opencode\skills\mobile-app-forge"
```

或者下载 `mobile-app-forge.zip` 解压到上述目录。然后重启 opencode。

## 使用

直接对 opencode 说：

- 「帮我做一个记录喝水的手机 APP」
- 「做一个记账 App，要能离线用，最后给我安装包」
- 「改一下柠檬喝水，加个提醒功能，重新打包」

技能会自动按以下流程执行：

1. 需求确认（页面、数据、平台）
2. 先做移动端网页版（纯 HTML/CSS/JS，无框架、可离线）
3. 无头浏览器多机型截图验收（390x844 / 375x667 / 430x932）
4. Capacitor 6 包装：图标、启动页、状态栏、返回键、导入导出
5. 构建并签名 APK，校验签名和包信息，交付到桌面和局域网下载地址

## 目录

```
SKILL.md                     技能主文件（流程、规范、踩坑）
scripts/qa-mobile.mjs        CDP 多视口截图 + JS 报错/溢出检测
scripts/make-app-assets.py   一张图标生成安卓自适应图标与启动页
scripts/build-apk.ps1        一键同步、构建、签名校验、复制 APK
references/windows-toolchain.md   无需 Android Studio 的 Windows 工具链安装（含国内镜像）
references/native-integration.md  返回键、导出分享、状态栏、签名、版本号
templates/                   package.json / capacitor.config / 验收配置样例
mobile-app-forge.zip         整个技能的打包下载
```

## 环境要求

- Windows 10/11 + Node.js 20+
- JDK 17 + Android SDK 34（`references/windows-toolchain.md` 有一份可复制粘贴的安装脚本，使用清华、腾讯镜像）
- 不需要 Android Studio、不需要模拟器、不需要 Play 商店账号

iOS 打包需要 macOS + Xcode，本技能只覆盖安卓。

## 特点

- 网页阶段就能截图验收，改版快，不用在模拟器里等
- 产物是自包含 APK：离线可用、不依赖电脑或服务器
- 数据存本机，内置 JSON 导出/导入备份
- 版本号与签名流程固定，覆盖安装不丢数据
