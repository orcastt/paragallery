# Parametric Gallery · 参数化设计作品集

黑金 · 时尚极简的**单页**作品集网站：顶部是「关于我」大图区（16:9 头像 + 大标题 + 居中简介），下面是作品图片墙。同一 prototype 的多张图按文件名**自动归为一个 post**，点击进入弹层可轮播 / 键盘 / 滑动切换。

- 纯静态，**不用 GitHub Actions**（浏览器直接读 `images/` 列表）
- 纯黑 + 纯金，无渐变；**全站 Oswald 细长字体**（已打包进仓库，国内也能正常显示）
- 卡片圆角、不显示日期、作品图 **3:4**

在线地址：**https://orcastt.github.io/paragallery/**

---

## 📥 如何添加作品图（一个作品一个文件夹）

在 `images/` 里，**给每个作品建一个文件夹**，把该作品的图放进去：

```
images/
  Snowflakes/          ← 文件夹名 = 卡片下方显示的名字
    1.jpg
    2.jpg              ← 里面按文件名排序，第一张自动当封面
    3.jpg
  Vase/
    1.jpg
    2.jpg
  Monument/
    1.jpg
```

- **文件夹名** = 作品标题（卡片下方文字，自动大写显示）。可带空格，如 `Space Grow/`
- 文件夹里的图**随便命名**（`1.jpg / 2.jpg` 或 `a.jpg / b.jpg` 都行），按文件名自然排序，第一张当封面
- 作品图建议 **3:4 竖图**（卡片按 3:4 显示，不裁切）
- 支持 `jpg / png / webp`；⚠️ iPhone 的 `.heic` 请先导出成 JPG
- **想控制作品排序**：文件夹名前加 8 位日期，如 `20250824 Monument/` → 按日期倒序（新的在前），**日期不显示**

> 也兼容旧的「平铺」方式：直接把 `Snowflakes (1).jpg` 放 `images/` 根目录、同名多张成组。但**推荐用文件夹**，更好管理。

上传：仓库 `images/` → 点进/新建作品文件夹 → `Add file → Upload files` → 拖入 → Commit；或本地 `git add images && git commit && git push`。推送后刷新即生效。

> ⚠️ 当前 `images/` 里的 4 个演示文件夹（Snowflakes/Vase/Moth/Monument）是占位示例，替换成你的真作品时直接删掉这些文件夹。

---

## 🗜️ 图片压缩（重要 —— 上传前务必做）

首页会加载每个作品的封面图，**原图（手机/相机几 MB）会让网站变慢、仓库变大**。上传前压到 web 尺寸即可，一张控制在 **300–500KB** 以内：

**最简单（免安装，拖拽即可）：**
- **[Squoosh.app](https://squoosh.app)**（Google 出品）：拖入图片 → 右侧选 **MozJPEG，Quality 75–80** → 若图很大，勾 **Resize** 把长边设到 **1600px** → Download
- 或 **[TinyPNG](https://tinypng.com)**：直接拖入批量压缩

**建议尺寸：**
| 用途 | 长边 | 质量 | 目标大小 |
|---|---|---|---|
| 作品图（3:4） | 1600px | 75–80 | < 400KB |
| 关于我头像（16:9） | 1920px | 80 | < 500KB |

> 原图自己另存备份，仓库里只放压缩版即可。需要我帮你写一个本地批量压缩脚本也可以说。

---

## 🙋 关于我（顶部大图区）

编辑 `assets/site.js` 的 `about` 段：

```js
about: {
  heading: 'Parametric\nGallery',        // 左上大标题，可用 \n 换行；改成你的名字/标语
  heroImage: 'assets/about-hero.jpg',    // 你的 16:9 横向头像（人物放右侧最佳）
  bio: [
    '第一段简介……',
    '第二段简介……',
  ],
  contact: {
    email: 'you@example.com',                 // 留空则不显示
    instagram: 'https://instagram.com/你',
    github: 'https://github.com/orcastt',
  },
},
```

把你的 16:9 照片传到 `assets/`（如 `assets/about-hero.jpg`），再把 `heroImage` 改成对应文件名。没传之前显示占位图，不会报错。

---

## 🚀 首次启用 GitHub Pages（一次性，不消耗 Actions 配额）

用 **"从分支部署"** 模式：

1. 仓库 **Settings → Pages → Source** 选 **Deploy from a branch**
2. **Branch** 选 `main`、文件夹 `/ (root)` → **Save**
3. 等一两分钟，访问 https://orcastt.github.io/paragallery/

> 仓库需为**公开**（读文件列表用免登录公开 API）。私有仓库 / 不依赖 API 见文末「固定 manifest」。
>
> 若刚推送后样式没变，多半是浏览器缓存，**硬刷新**（Ctrl/⌘ + Shift + R）即可。

---

## 🎨 改文字 / 配色

- **文字、简介、链接**：全在 `assets/site.js`
- **配色 / 字号 / 圆角**：`assets/style.css` 顶部的 `:root` 变量（金色 `--gold`、背景 `--canvas`、圆角 `--r-card`、卡片比例在 `.card-media` 的 `aspect-ratio`）

---

## 🧪 本地预览

```bash
python3 -m http.server 8000      # 打开 http://localhost:8000
```

想预览本地还没推上去的图，先跑 `node scripts/build-manifest.js` 生成 `manifest.json`，页面会优先用它。

## 🔧 进阶：固定 manifest（私有仓库 / 离线）

```bash
node scripts/build-manifest.js
git add -f manifest.json && git commit -m "Pin manifest" && git push
```

仓库里一旦存在非空 `manifest.json`，网站就优先用它，不再调 API。

## 📁 结构

```
├── index.html                  # 单页（关于我 + 作品）
├── .nojekyll
├── assets/
│   ├── site.js                 # ★ 站点配置（文字/简介/链接都在这）
│   ├── style.css               # 黑金视觉系统
│   ├── fonts.css + fonts/      # 自托管 Oswald
│   ├── chrome.js               # 顶栏/页脚
│   ├── gallery-core.js         # 文件夹/文件名 → post 分组（前后端共用）
│   ├── app.js                  # 关于我渲染 + 网格 + 弹层 + 读取目录树
│   └── about-hero.svg          # 16:9 头像占位图
├── images/                     # ← 一个作品一个文件夹放这里
│   ├── Snowflakes/  (1.jpg 2.jpg …)
│   └── Vase/        (1.jpg 2.jpg …)
└── scripts/build-manifest.js   # 可选：生成固定 manifest.json
```
