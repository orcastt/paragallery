/* ────────────────────────────────────────────────────────────────
   站点配置 —— 改文字、简介、链接都在这一个文件里。
   两个页面（作品页 index.html / 关于页 about.html）共用。
   ──────────────────────────────────────────────────────────────── */
window.SITE = {
  // 顶部字标 & 页脚署名
  wordmark: 'CHU HENG TAN',
  author: '@TT',

  // 作品区小标题（图片 gallery 上方）
  worksTitle: 'Selected Works',

  // 网站从这个公开仓库读取 images/ 的文件列表（无需构建、不用 Actions）
  repo: 'orcastt/paragallery',
  branch: 'main',

  // 右上角外链（不需要就设为 null）
  link: null,

  // ── 顶部「关于我」大图区 ──
  about: {
    // 左上角叠加的大标题（可用 \n 换行）。改成你的名字或标语。
    heading: 'Parametric\nGallery',
    // 你的 16:9 横向头像：传到 assets/ 后改成对应文件名，例如 'assets/about-hero.jpg'。
    // 传之前先用这张占位图。人物/头部放在图片右侧效果最好。
    heroImage: 'assets/about-hero.jpg',
    // 简介，每个字符串是一段（英文）。随便改成你自己的。
    bio: [
      'A parametric designer exploring the generative logic of form through algorithms and computational geometry.',
      'Each piece is driven by a tunable parameter system — shift a few variables and one prototype evolves into hundreds of states. A record of those moments: same origin, different form.',
    ],
    // 联系方式（留空的会自动隐藏）
    contact: {
      email: '',                          // 例如 'you@example.com'
      instagram: '',                      // 例如 'https://instagram.com/xxx'
      github: '',
    },
  },
};
