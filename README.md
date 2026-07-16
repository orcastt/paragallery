# Parametric Gallery · 参数化设计作品集

黑金风格的静态作品集网站，专为 Instagram 式的成组作品图设计。
同一个 prototype 的多张图会自动归为一个 **post**：首页展示封面网格，点击进入弹层，可以轮播 / 键盘 / 滑动切换该组的所有图。

在线地址（启用 Pages 后）：**https://orcastt.github.io/paragallery/**

---

## 📥 如何添加图片（唯一需要做的事）

把图片放进 `images/` 文件夹，按这个格式命名，然后推送到 `main` 分支即可：

```
20240711Snowflakes (1).jpg
20240711Snowflakes (2).jpg
20240711Snowflakes (3).jpg      ← 同日期同名 → 自动归为一个 post
20250824Monument (1).png
20250921garden (4).webp
```

命名规则 = **`日期(8位)` + `项目名` + `(序号)`**，也就是你现在已有的命名方式，直接拖进来就能用。

- 支持 `jpg / png / webp / gif / avif / svg`
- ⚠️ **iPhone 默认的 `.heic` 不被浏览器支持**，请先导出成 JPG（iOS：设置 → 相机 → 格式 → 兼容性最佳，或用分享导出）。不支持的格式会被自动忽略
- 括号里的序号决定组内顺序；`(1)` 自动成为封面（半角 `(1)` 或全角 `（1）` 都行）
- 没有序号的文件（如 `20251122Tidal.jpg`）会成为单图 post
- 项目名可以带空格（`Mountain blcok`）、中文也可以
- 文件名尽量避免 `#`、`?`、`%` 这些字符；仅大小写不同的两个文件（`Moth` 与 `moth`）会被当作同一张，后者忽略
- 首页按日期倒序排列（最新在前），并自动生成年份筛选

**上传方式任选：**

1. **网页端**：GitHub 仓库页 → `images/` 文件夹 → `Add file → Upload files` → 拖入图片 → Commit。
2. **本地 git**：
   ```bash
   cp ~/我的图/*.jpg images/
   git add images && git commit -m "Add new works" && git push
   ```

网站会**在浏览器里直接读取 `images/` 目录的文件列表**（通过 GitHub 公开 API）并自动分组，推送后刷新即生效。**不需要 GitHub Actions，不需要构建，不需要手动维护任何列表。**

> ⚠️ 当前 `images/` 里的 16 张 SVG 是演示占位图，替换成你的真图时直接删掉它们即可。

---

## 🚀 首次启用 GitHub Pages（只需一次，不消耗 Actions 配额）

本站是纯静态页面，用 **"从分支部署"** 模式，**完全不跑 GitHub Actions**：

1. 合并本 PR 到 `main`
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **Deploy from a branch**
3. **Branch** 选 `main`、文件夹选 `/ (root)`，点 **Save**
4. 等一两分钟，访问 https://orcastt.github.io/paragallery/

> 之后每次往 `images/` 推图，网站都会自动读取最新列表——无需再碰 Pages 设置。
>
> ℹ️ 仓库需为**公开**（读取文件列表用的是免登录的公开 API，约每小时每访客 60 次上限，个人作品集完全够用）。若你想改成私有仓库、或不想依赖 API，见下方「进阶：固定 manifest」。

---

## 🎨 修改站点文字 / 链接

编辑 `index.html` 顶部的配置块：

```js
window.SITE = {
  wordmark: 'PARAMETRIC GALLERY',   // 左上角字标
  heroTitle: 'Parametric Studies',  // 首页大标题
  heroSubtitle: '…',                // 副标题
  author: '@TT',                    // 页脚署名
  repo: 'orcastt/paragallery',      // 读取 images/ 列表的公开仓库
  branch: 'main',                   // 读取哪个分支
  link: { label: 'GitHub', url: 'https://github.com/orcastt/paragallery' }, // 右上角链接，设为 null 隐藏
};
```

配色在 `assets/style.css` 顶部的 `:root` 变量里（金色、背景、发丝线等）。

---

## 🧪 本地预览

浏览器直接读线上 GitHub 列表，所以本地起个静态服务器就能预览线上内容：

```bash
python3 -m http.server 8000      # 或任何静态服务器
# 打开 http://localhost:8000
```

想预览「本地还没推上去的图」，先跑一次生成脚本，页面会优先用本地 `manifest.json`：

```bash
node scripts/build-manifest.js   # 扫描本地 images/ 生成 manifest.json
```

---

## 🔧 进阶：固定 manifest（私有仓库 / 离线 / 不依赖 API）

网站默认从 GitHub 公开 API 读 `images/` 列表。如果你把仓库改成私有、或不想依赖 API，可以改用「固定清单」：

```bash
node scripts/build-manifest.js   # 生成 manifest.json
git add -f manifest.json && git commit -m "Pin manifest" && git push
```

一旦仓库里存在非空的 `manifest.json`，网站就优先用它、不再调 API。代价是每次加图都要重跑这条命令并提交。

## 📁 结构

```
├── index.html                  # 页面骨架 + 站点配置
├── .nojekyll                   # 让带空格/中文的文件名原样发布
├── assets/
│   ├── style.css               # 黑金视觉系统
│   ├── gallery-core.js         # 文件名 → post 分组（前后端共用）
│   └── app.js                  # 网格渲染 + post 弹层轮播 + 读取列表
├── images/                     # ← 你的作品图都放这里
└── scripts/build-manifest.js   # 可选：生成固定 manifest.json
```

## ✨ 功能

- 封面网格（4/3/2/1 列自适应），悬停微缩放 + 金色描边
- 多图 post：`N 图` 角标、弹层轮播、缩略图条、`←`/`→` 键盘、移动端滑动、点击大图翻页
- 深链接：每张图有独立 URL（`#p=20240711-snowflakes&i=3`），可直接分享
- 年份筛选、懒加载、相邻图预加载
