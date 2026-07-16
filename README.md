# Parametric Gallery · 参数化设计作品集

黑金 · 时尚极简的静态作品集网站。同一个 prototype 的多张图按文件名**自动归为一个 post**：首页封面网格 → 点击进入弹层 → 轮播 / 键盘 / 滑动 / 缩略图切换整组图。含**「关于我」页面**。

- 纯静态，**不用 GitHub Actions**（浏览器直接读 `images/` 列表）
- 纯黑 + 纯金，无渐变；细长无衬线字体（Oswald + Manrope，已打包进仓库，国内也能正常显示）
- 卡片圆角、不显示日期

在线地址：**https://orcastt.github.io/paragallery/**

---

## 📥 如何添加图片（唯一需要做的事）

把图片放进 `images/` 文件夹，命名后推送即可：

```
Snowflakes (1).jpg
Snowflakes (2).jpg
Snowflakes (3).jpg      ← 同名多张 → 自动归为一个可轮播的 post
Monument (1).png
Vase (1).webp
```

- 支持 `jpg / png / webp / gif / avif / svg`
- 括号里的序号决定组内顺序；`(1)` 自动成为封面（半角 `(1)` 或全角 `（1）` 都行）
- 没有序号的文件（如 `Tidal.jpg`）会成为单图 post
- 项目名可带空格、中文
- ⚠️ iPhone 的 `.heic` 浏览器不支持，请先导出成 JPG
- **想控制排列顺序**：文件名前加 8 位日期前缀（如 `20250824Monument (1).jpg`），网站按日期倒序排列但**不会显示日期**

**上传方式任选：**

1. **网页端**：仓库 `images/` 文件夹 → `Add file → Upload files` → 拖入 → Commit
2. **本地 git**：`cp ~/图/*.jpg images/ && git add images && git commit -m "add" && git push`

推送后网站会在浏览器里直接读取最新列表，刷新即生效。**不用构建、不用 Actions、不用维护任何列表。**

> ⚠️ 当前 `images/` 里的 16 张 SVG 是演示占位图，替换成你的真图时直接删掉。

---

## 🙋 关于我页面（照片 + 简介）

1. **传照片**：把你的照片传到 `assets/` 文件夹（例如 `assets/portrait.jpg`）
2. **改配置**：编辑 `assets/site.js` 里的 `about` 段：

```js
about: {
  name: '你的名字',
  portrait: 'assets/portrait.jpg',   // 改成你上传的照片文件名
  bio: [
    '第一段（会用较大的金色字显示）',
    '第二段……',
    '第三段……',
  ],
  contact: {
    email: 'you@example.com',                 // 留空则不显示
    instagram: 'https://instagram.com/你',    // 留空则不显示
    github: 'https://github.com/orcastt',
  },
},
```

没传照片前，页面会显示一张占位图（`assets/portrait.svg`），不会报错。

---

## 🚀 首次启用 GitHub Pages（一次性，不消耗 Actions 配额）

用 **"从分支部署"** 模式，完全不跑 Actions：

1. 合并本 PR 到 `main`（若尚未合并）
2. 仓库 **Settings → Pages → Source** 选 **Deploy from a branch**
3. **Branch** 选 `main`、文件夹 `/ (root)` → **Save**
4. 等一两分钟，访问 https://orcastt.github.io/paragallery/

> ℹ️ 仓库需为**公开**（读文件列表用的是免登录公开 API，约每小时每访客 60 次，个人作品集足够）。想改私有仓库 / 不依赖 API，见文末「固定 manifest」。

---

## 🎨 改文字 / 配色 / 加页面

- **文字、链接、简介**：全在 `assets/site.js` 一个文件里改
- **配色 / 字号 / 圆角**：`assets/style.css` 顶部的 `:root` 变量（金色 `--gold`、背景 `--canvas`、圆角 `--r-card` 等）
- **换字体**：替换 `assets/fonts/` 里的 woff2 并改 `assets/fonts.css` 与 `--display` / `--sans`
- **加新页面**：复制 `about.html` 改内容，在两个 HTML 的 `<nav>` 里加一行 `<a class="nav-link" ...>` 即可

---

## 🧪 本地预览

```bash
python3 -m http.server 8000      # 或任何静态服务器
# 打开 http://localhost:8000
```

想预览「本地还没推上去的图」，先跑一次 `node scripts/build-manifest.js` 生成 `manifest.json`，页面会优先用它。

---

## 🔧 进阶：固定 manifest（私有仓库 / 离线 / 不依赖 API）

网站默认从 GitHub 公开 API 读 `images/` 列表。若改私有仓库或不想依赖 API：

```bash
node scripts/build-manifest.js
git add -f manifest.json && git commit -m "Pin manifest" && git push
```

仓库里一旦存在非空 `manifest.json`，网站就优先用它。代价是每次加图都要重跑这条命令并提交。

## 📁 结构

```
├── index.html                  # 作品页
├── about.html                  # 关于我页
├── .nojekyll                   # 让带空格/中文的文件名原样发布
├── assets/
│   ├── site.js                 # ★ 站点配置（文字/简介/链接都在这）
│   ├── style.css               # 黑金视觉系统
│   ├── fonts.css + fonts/      # 自托管字体（Oswald + Manrope）
│   ├── chrome.js               # 顶栏/页脚/导航高亮
│   ├── gallery-core.js         # 文件名 → post 分组（前后端共用）
│   ├── app.js                  # 网格 + 弹层轮播 + 读取列表
│   ├── about.js                # 关于我页渲染
│   └── portrait.svg            # 照片占位图
├── images/                     # ← 你的作品图都放这里
└── scripts/build-manifest.js   # 可选：生成固定 manifest.json
```
