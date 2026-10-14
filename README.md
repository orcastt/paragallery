# Parametric Gallery · 参数化设计作品集

黑金 · 时尚极简的**单页**作品集网站：顶部是「关于我」大图区（16:9 头像 + 大标题 + 居中简介），下面是作品图片墙。同一 prototype 的多张图按文件名**自动归为一个 post**，点击进入弹层可轮播 / 键盘 / 滑动切换。

- 纯静态网站：GitHub Actions 构建点云展厅、生成作品清单并发布 GitHub Pages
- 纯黑 + 纯金，无渐变；**全站 Oswald 细长字体**（已打包进仓库，国内也能正常显示）
- 卡片圆角、不显示日期、作品图 **3:4**

在线地址：**https://orcastt.github.io/paragallery/**

## Particle Museum · 黑色粒子博物馆

原有图片作品集保持在 `index.html`；`particles.html` 是 Three.js 黑色大空间博物馆，首页导航中的 **Space** 可进入。默认沿弯曲航线向前移动，作品在世界空间中依次汇聚、从身边经过或让观众穿过，随后散回黑暗。全部作品从同一份构建生成的 `manifest.json` 读取，按照原作品集的日期倒序循环展映。

```powershell
npm ci
npm run dev
# http://127.0.0.1:8000/particles.html
```

- 连续航行：自动向前，右键拖动环顾，滚轮推进 / 后退；速度可调。多个展位同时存在，侧向展位与中央穿越展位交替。
- 单件观赏：右键旋转，滚轮 / 双指缩放，不自动绕转。自由漫游：右键转向，WASD 移动，Q/E 升降，Shift 加速；手机前进 / 后退按钮。
- 左键只触碰鼠标射线实际命中的最近粒子，在该 XYZ 接触点周围的小球范围推动、吸引或轻旋，不沿整条射线扭动作品。局部粒子有速度与阻尼弹簧，松手回弹；空白处不触发，最大位移限制为模型宽度约 2%。1–4 键切换触碰 / 推开 / 吸引 / 轻旋，空格或“轻散”让少量粒子短暂散开。鼠标交互不修改摄像机投影。
- 双击、← / →、底部箭头切换作品；缩略图及目录可跳转。近距离跳转沿航线移动，远距离跳转以黑场淡入淡出。
- 螺旋汇聚 / 星尘聚合 / 粒子雨 / 分层重组按展位交替，也可手动选择。聚散程度由相机到展位的距离决定，不是单一图片轮播。
- 默认近处 160K 粒子，手机 64K，可选 320K；远处自适应低密度，屏幕负担高时降低屏幕采样而保留近处几何精度。I 键隐藏界面，Esc 恢复并返回航线。
- 暂停同时停泊航线与动态；打开目录 / 设置时停泊。默认尊重系统减少动态偏好，不自动启航。原作对照可查看当前作品的原渲染图。

### 三种来源：逐件依图建模，不用通用形态替代作品

当前仓库只有渲染图片，没有原始模型或生成工程。展厅不会声称从图片精确恢复了原作。

1. **依原图推断的三维模型（默认）**：逐件查看图片，描绘轮廓 / 孔室，辨认构件连接，建立独立 XYZ 三角网格或线段，再从几何采样粒子。不是根据作品名称随机生成一种形态，也不是给照片亮度增加厚度。当前有 **4 / 64 件的第一批推断模型**：Wave Erosion、Crytallization、Cable、Prototype 6。尺寸只有相对比例，背面、遮挡和细部仍为估计，**不是原模型的精确恢复**。
2. **平面原图参考**：尚未逐件建模的作品只显示平面图像采样，Z=0，明确标记“待建模”。不会用其他形态填充。也可在设置中主动选择原图参考。它不声称恢复了背面或三维拓扑。
3. **真实模型（优先）**：有原模型的作品直接按原始几何采样，替换前两种模式。图片推断无需用户逐个上传模型；若提供原模型 / 生成工程，仍优先使用准确几何。

这一批的图像依据和局限：

| 作品 | 按图保留的结构 | 不确定的部分 |
| --- | --- | --- |
| Wave Erosion | 图 1/3 两侧边界分别以局部图像边缘细化；384 个横向采样、78 层台阶、独立悬垂线笼；框架矢量约束比例 | 遮挡边界和中间截面为估计放样，不能据此认定隐藏拓扑；倒影不建模 |
| Crytallization | 图 1 的 11 处孔口各有 128 个边缘采样、图像细化的屋顶轮廓、竖向线笼及下层连桥；孔壁保留不规则竖向形态 | 图 5/6 人工估计孔深、收口及背部连续线笼，遮挡处的真实连通未知；倒影排除 |
| Cable | 图 2 骨架 / 图 5 密索校核的 20 组三角肋，同心环、肋边之间的索线、辐条与中心小筒 | 相对高度、索径及连接细节。构造阶段不冒充标定多视角；不添加随机下垂波纹 |
| Prototype 6 | 仅图 2 上方主模块的开孔地台、L 墙、格梁和空窗框 | 墙厚、开孔与背面接缝；拼图中的其他变体不合并 |

“原作对照”默认展示对应的建模区域，可切换完整原图，并显示可见结构与推断限制；桌面分栏对照不遮挡模型。三件线构作品均可“结构线核对”（稳定线段，不使用粒子变形）和对齐对应的摄影视角（近似角度）。粒子静止时不再全局漂移，只有实际局部触碰才发生形变。可下载推断的 OBJ 几何（非原模型，非物理尺寸；Wave / Crytallization / Cable 保留 `l` 线段，Prototype 6 为三角网格），构建时生成到 `dist/models/inferred/`。点采样由本地后台线程处理。每个模型在 `reconstructions.mjs` 有独立 ID、图片依据和几何函数；未登记的 ID 返回空，不按名称套用模型。目录明确区分细化试样 / 初版推断 / 待建模作品。

Wave 的图像数据由 `scripts/reconstruct-wave.py` 生成（可选离线工具，需 Pillow / NumPy）。输入是仓库公开图片，数据内记录源图哈希；局部边缘搜索由人工标记的构件区域约束，不用图像亮度作为 Z。中间截面由两侧放样起步，在上下 6 个高度格内用同一 XYZ 候选点的双图投影边缘约束细化，没有随机几何噪声；遮挡造成的歧义仍然存在。Crytallization 的图像轮廓与估计的有限孔腔由 `scripts/reconstruct-crystal.py` 生成，前方孔口 / 屋顶边缘是图像约束，孔深 / 背部是人工估计，不将全部孔洞无限挤出。提交的 JSON 可直接构建，部署不需要 Python。图像引导边界与估计放样要区分；线笼的闭合剪影不能当成实体或三维准确率。当前 Wave / Crytallization / Cable 是细化试样，Prototype 6 仍为初版，其他作品待建模，不代表全部复原完成。

要展示真实三维作品，可在粒子设置里导入 **GLB / OBJ / PLY / STL**，按模型几何进行表面采样；PLY 点云可直接采样。文件仅在浏览器本机读取，不上传，当前会话有效。OBJ 暂不加载配套纹理；GLB 建议嵌入依赖，压缩网格应先导出为未压缩版本。

持久化模型：将允许公开的模型放到 `models/`，在 `assets/particles-config.js` 的 `models` 中按项目 ID 注册：

```js
models: {
  '20240710-vase': { src: 'models/vase.glb', rotation: [0, 0, 0] },
},
```

项目 ID 可在构建后的 `dist/manifest.json` 查找。模型模式会替换推断 / 影像来源，显示“真实三维模型”。只应将准备展示的模型放入 `models/`；本机 `originals/` 保持忽略。

### 构建与 GitHub Pages

```powershell
npm test
npm run build
```

`dist/` 是完整的静态站点。Three.js 及加载器打包为本地资源，不依赖访问外部 CDN。GitHub Pages 使用仓库中的 Actions 工作流：安装依赖、验证、构建，再只上传 `dist/`。构建仅复制页面、公开资源、图片与公开模型，不上传原图、Git 历史或 node_modules。修改后重新运行构建 / 启动预览即可查看。

源码：`src/particles/app.js`（展厅与输入）、`interaction.mjs`（局部 XYZ 命中与阻尼回弹）、`journey.mjs`（世界路径与距离聚散）、`reconstructions.mjs`（逐件依图推断的几何与依据）、`sampling.mjs`（平面图片采样）、`models.js`（原模型采样）、`shaders.mjs`（GPU 汇聚与局部偏移显示）。此实现独立编写，运行依赖为 MIT 许可的 Three.js。

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

> 当前 `images/` 已是实际作品集；不要删除作品文件夹来替换演示占位。

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

## 🚀 GitHub Pages 发布

用 **GitHub Actions** 模式（仓库已有 `.github/workflows/deploy-pages.yml`）：

1. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**。
2. 推送到 `main` 后会自动验证、打包 Three.js、生成清单并部署 `dist/`；也可在 Actions 中手动运行工作流。
3. 等工作流完成，访问 https://orcastt.github.io/paragallery/；点云页面为 `particles.html`。

> 当前仓库为公开仓库。部署产物自带 `manifest.json`，展厅和图片集不需要在浏览器调用 GitHub API 读取作品清单。
>
> 若刚推送后样式没变，多半是浏览器缓存，**硬刷新**（Ctrl/⌘ + Shift + R）即可。

---

## 🎨 改文字 / 配色

- **文字、简介、链接**：全在 `assets/site.js`
- **配色 / 字号 / 圆角**：`assets/style.css` 顶部的 `:root` 变量（金色 `--gold`、背景 `--canvas`、圆角 `--r-card`、卡片比例在 `.card-media` 的 `aspect-ratio`）

---

## 🧪 本地预览

完整站点（含粒子展厅）使用前文的 `npm run dev`。以下命令仅用于直接预览原图片 Gallery：

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
