/**
 * PromptGallery 静态资源数据 - PostPilot 精选商业与社媒创作案例
 */

export interface PostPilotShowcaseItem {
  id: string
  title: string
  category: string
  mediaType: 'video' | 'image'
  cover: string
  video?: string
  materials: string[]
  prompt: string
  highlight: string
}

export const promptGalleryAssets: PostPilotShowcaseItem[] = [
  {
    id: 'headphones-promo',
    title: '旗舰钛金属降噪耳机 · 商业宣传短片',
    category: '商业产品视频 · 9:16',
    mediaType: 'video',
    cover: '/assets/postpilot-examples/headphones-cover.jpg',
    video: '/assets/postpilot-examples/headphones-promo.mp4',
    materials: ['/assets/postpilot-examples/headphones-cover.jpg'],
    highlight: '即梦 Seedance 2.0 · 棚拍微光运镜',
    prompt: '帮我围绕「旗舰钛金属主动降噪耳机」策划一条 8 秒竖屏商业广告短片：极简暗调石台布景，镜头沿拉丝钛金属头梁与皮革耳罩缓慢推近，配合冷暖轮廓光反射质感，并生成适配抖音与小红书的种草标题、口播文案与话题标签。',
  },
  {
    id: 'sneaker-editorial',
    title: '先锋建筑感球鞋 · 极简商业大片',
    category: '品牌视觉组图 · 3:4',
    mediaType: 'image',
    cover: '/assets/postpilot-examples/case-sneaker.png',
    materials: ['/assets/postpilot-examples/case-sneaker.png'],
    highlight: '即梦 5.0 · 极简几何石材棚拍',
    prompt: '请基于这双米白色先锋运动鞋，生成一组 3:4 小红书商业种草图集（建筑感几何石台、柔和自然斜射光、干净暖灰极简背景），并撰写一篇突出脚感与穿搭质感的种草笔记与 5 个精准标签。',
  },
  {
    id: 'founder-portrait',
    title: '科技品牌主理人 · 杂志级写实人像',
    category: '商业人物形象 · 3:4',
    mediaType: 'image',
    cover: '/assets/postpilot-examples/case-portrait.png',
    materials: ['/assets/postpilot-examples/case-portrait.png'],
    highlight: '写实人像 · 个人 IP 专栏封面',
    prompt: '请帮我打造一组现代极简建筑空间的品牌创始人形象大片（自然日光、低饱和高级灰调、自信松弛神态），并配合撰写一篇适合公众号与小红书个人 IP 首发的深度介绍文案。',
  },
]
