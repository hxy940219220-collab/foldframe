/**
 * 路由/导航数据配置
 * 包含开源版保留导航项的图标、路径、翻译键等信息。
 */

import {
  BookOpen,
  CalendarClock,
  ChartColumnIncreasing,
  Cpu,
  History,
  Images,
  Palette,
  Sparkles,
} from 'lucide-react'

export interface IRouterDataItem {
  // 导航标题
  name: string
  // 翻译键
  translationKey: string
  // 跳转链接
  path?: string
  // 图标
  icon?: React.ReactNode
  // 子导航
  children?: IRouterDataItem[]
}

export const routerData: IRouterDataItem[] = [
  {
    name: 'Plan & Compose',
    translationKey: 'aiSocial',
    path: '/ai-social',
    icon: <Sparkles size={20} />,
  },
  {
    name: 'Visual Studio',
    translationKey: 'header.draftBox',
    path: '/',
    icon: <Palette size={20} />,
  },
  {
    name: 'Task History',
    translationKey: 'tasksHistory',
    path: '/tasks-history',
    icon: <History size={20} />,
  },
  {
    name: 'Schedule',
    translationKey: 'accounts',
    path: '/accounts',
    icon: <CalendarClock size={20} />,
  },
  {
    name: 'Asset Library',
    translationKey: 'header.agentAssets',
    path: '/agent-assets',
    icon: <Images size={20} />,
  },
  {
    name: 'Models',
    translationKey: 'studioModels',
    path: '/models',
    icon: <Cpu size={20} />,
  },
  {
    name: 'Skills',
    translationKey: 'studioSkills',
    path: '/skills',
    icon: <BookOpen size={20} />,
  },
  {
    name: 'Usage',
    translationKey: 'studioUsage',
    path: '/usage',
    icon: <ChartColumnIncreasing size={20} />,
  },
]

export const visibleRouterData = routerData
