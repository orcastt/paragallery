/* ────────────────────────────────────────────────────────────────
   站点配置 —— 改文字、简介、链接都在这一个文件里。
   两个页面（作品页 index.html / 关于页 about.html）共用。
   ──────────────────────────────────────────────────────────────── */
window.SITE = {
  // 顶部字标 & 页脚署名
  wordmark: 'PARAMETRIC',
  author: '@TT',

  // 作品页大标题
  heroTitle: 'Selected Works',
  heroSubtitle: 'Parametric design · computational geometry',

  // 网站从这个公开仓库读取 images/ 的文件列表（无需构建、不用 Actions）
  repo: 'orcastt/paragallery',
  branch: 'main',

  // 右上角外链（不需要就设为 null）
  link: { label: 'Instagram', url: 'https://github.com/orcastt/paragallery' },

  // ── 关于我页面 ──
  about: {
    name: '关于我',                       // 页面大标题 / 你的名字
    // 你的照片：把照片传到 assets/ 并改成对应文件名，例如 'assets/portrait.jpg'
    // 传之前先用这张占位图。
    portrait: 'assets/portrait.svg',
    // 简介，每个字符串是一段。随便改成你自己的。
    bio: [
      '我是一名参数化设计师，用算法与计算几何探索形态的生成逻辑。',
      '每一件作品都由一套可调的参数系统驱动——改变几个变量，同一个原型便会演化出成百上千种状态。这个作品集记录的，正是这些「同源而异形」的瞬间。',
      '涉猎建筑形态、结构编织、生长系统与数字造物。欢迎交流与合作。',
    ],
    // 联系方式（留空的会自动隐藏）
    contact: {
      email: '',                          // 例如 'you@example.com'
      instagram: '',                      // 例如 'https://instagram.com/xxx'
      github: 'https://github.com/orcastt',
    },
  },
};
