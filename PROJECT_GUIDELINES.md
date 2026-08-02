# 项目内容规范

## 本机原图与公开网页图

```text
originals/images/     本机 PNG / JPG 原图；已被 Git 忽略，绝不上传
images/               自动生成的 WebP；提交到 GitHub，供网页展示
originals/about-hero.png
assets/about-hero.webp
```

原图与公开图的文件夹结构相同。将新作品放到 `originals/images/`，再运行：

```powershell
& 'C:\Users\orcas\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/build-webp.py
```

脚本会生成最长边不超过 1600px、质量为 82 的 WebP，并清除图片元数据。只提交 `images/` 中生成的 WebP；不要提交 `originals/`。

## 命名

一个作品对应一个文件夹，文件夹名就是网页显示的标题：

```text
originals/images/20260801 Glass Study/
  1.png
  2.png
```

- 日期 `YYYYMMDD` 只控制作品排序，网页不会显示日期。
- 每组图片从 `1.png` 连续编号；第一张是封面。
- 生成后的网页版本将对应为 `1.webp`、`2.webp`。

## 头像

将头像原图保存为 `originals/about-hero.png`，运行同一脚本后会生成 `assets/about-hero.webp`。建议横图，人物位于右侧。
