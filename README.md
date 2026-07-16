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
- ⚠️ **iPhone 默认的 `.heic` 不被浏览器支持**，请先导出成 JPG（iOS：设置 → 相机 → 格式 → 兼容性最佳，或用分享导出）。不支持的格式会被静默跳过，可在 Action 运行日志里看到 `::warning`
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

推送后 GitHub Action 会自动扫描 `images/`、重新生成 `manifest.json` 并发布网站，约 1 分钟生效。**不需要手动维护任何列表。**

> ⚠️ 当前 `images/` 里的 16 张 SVG 是演示占位图，替换成你的真图时直接删掉它们即可。

---

## 🚀 首次启用 GitHub Pages（只需一次）

> ⚠️ 顺序很重要：**先启用 Pages，再合并 PR**。否则合并会立刻触发一次部署，而此时 Pages 还没开启，那次运行会红 ✗ 失败（属正常，按下面第 4 步重跑即可）。

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**（此时还没有 workflow 也能选）
2. 合并本 PR 到 `main`
3. 打开 **Actions** 页签查看 `Deploy gallery to GitHub Pages` 的运行
4. 如果那次运行失败（在启用 Pages 之前触发），点进去 **Re-run all jobs**；或直接点 `Run workflow` 手动跑一次（workflow 支持手动触发）
5. 变绿后访问 https://orcastt.github.io/paragallery/

---

## 🎨 修改站点文字 / 链接

编辑 `index.html` 顶部的配置块：

```js
window.SITE = {
  wordmark: 'PARAMETRIC GALLERY',   // 左上角字标
  heroTitle: 'Parametric Studies',  // 首页大标题
  heroSubtitle: '…',                // 副标题
  author: '@TT',                    // 页脚署名
  link: { label: 'GitHub', url: 'https://github.com/orcastt/paragallery' }, // 右上角链接，设为 null 隐藏
};
```

配色在 `assets/style.css` 顶部的 `:root` 变量里（金色、背景、发丝线等）。

---

## 🧪 本地预览

`manifest.json` 不纳入版本库（由 CI 自动生成），所以本地预览**必须先跑一次生成脚本**，否则页面会显示「还没有作品」：

```bash
node scripts/build-manifest.js   # 必需：扫描 images/ 生成 manifest.json
python3 -m http.server 8000      # 或任何静态服务器
# 打开 http://localhost:8000
```

## 📁 结构

```
├── index.html                  # 页面骨架 + 站点配置
├── assets/
│   ├── style.css               # 黑金视觉系统
│   └── app.js                  # 网格渲染 + post 弹层轮播
├── images/                     # ← 你的作品图都放这里
├── manifest.json               # 自动生成，勿手改
├── scripts/build-manifest.js   # 文件名 → post 分组
└── .github/workflows/deploy.yml # 推送即部署
```

## ✨ 功能

- 封面网格（4/3/2/1 列自适应），悬停微缩放 + 金色描边
- 多图 post：`N 图` 角标、弹层轮播、缩略图条、`←`/`→` 键盘、移动端滑动、点击大图翻页
- 深链接：每张图有独立 URL（`#p=20240711-snowflakes&i=3`），可直接分享
- 年份筛选、懒加载、相邻图预加载
