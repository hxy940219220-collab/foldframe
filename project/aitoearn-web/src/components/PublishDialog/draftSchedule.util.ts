import type { PromotionMaterial } from '@/api/materials/material.types'
import { AccountStatus } from '@/app/config/accountConfig'
import { PlatType } from '@/app/config/platConfig'
import { PubType } from '@/app/config/publishConfig'
import { buildPublishParamsFromDraft } from '@/components/PublishDialog/PublishDialog.util'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import { getPlatformInfoSync } from '@/store/platformMetadata'

export const SCHEDULE_DRAFT_STORAGE_KEY = 'postpilot_schedule_draft_handoff'

export interface DraftPlatformMeta {
  label: string
  badgeClass: string
  composerKey: 'xhs' | 'douyin' | 'bilibili' | 'twitter' | 'instagram' | 'youtube' | 'wxSph'
}

export const DRAFT_PLATFORM_META: Record<string, DraftPlatformMeta> = {
  [PlatType.Xhs]: {
    label: '小红书',
    badgeClass: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    composerKey: 'xhs',
  },
  [PlatType.Douyin]: {
    label: '抖音',
    badgeClass: 'bg-zinc-900/10 text-zinc-800 border-zinc-900/15 dark:bg-zinc-100/15 dark:text-zinc-200',
    composerKey: 'douyin',
  },
  [PlatType.BILIBILI]: {
    label: 'B站',
    badgeClass: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
    composerKey: 'bilibili',
  },
  [PlatType.Twitter]: {
    label: 'X',
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
    composerKey: 'twitter',
  },
  [PlatType.Instagram]: {
    label: 'Instagram',
    badgeClass: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
    composerKey: 'instagram',
  },
  [PlatType.YouTube]: {
    label: 'YouTube',
    badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20',
    composerKey: 'youtube',
  },
  [PlatType.WxSph]: {
    label: '视频号',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    composerKey: 'wxSph',
  },
}

export function getDraftPlatformMeta(accountType?: string): DraftPlatformMeta {
  if (!accountType) {
    return {
      label: '多平台通用',
      badgeClass: 'bg-primary/10 text-primary border-primary/20',
      composerKey: 'xhs',
    }
  }
  return DRAFT_PLATFORM_META[accountType] || {
    label: accountType,
    badgeClass: 'bg-muted text-muted-foreground border-border',
    composerKey: 'xhs',
  }
}

/**
 * 将排版好的草稿一键填入 PublishDialog 右侧发布编辑器，并在尚未勾选账号时自动匹配对应平台账号
 */
export async function applyDraftToPublishDialog(draft: PromotionMaterial): Promise<{
  applied: boolean
  hasAccounts: boolean
  matchedCount: number
}> {
  const store = usePublishDialog.getState()
  store.setPublishContentLoading(true)

  try {
    const hasVideo = draft.type === PubType.VIDEO || (draft.mediaList || []).some(m => m.type === 'video')
    const requiredPubType = hasVideo ? PubType.VIDEO : PubType.ImageText
    const supportsDraft = (platType: PlatType) => {
      const info = getPlatformInfoSync(platType)
      return !info || info.pubTypes.has(requiredPubType)
    }

    // 1. 若尚未勾选账号，或当前已选账号均不支持该草稿类型（如仅选了纯视频平台却填入图文草稿），自动切换匹配可用账号
    let chosen = store.pubListChoosed
    const chosenHasCompatible = chosen.some(item => supportsDraft(item.account.type))
    if ((chosen.length === 0 || !chosenHasCompatible) && store.pubList.length > 0) {
      const targetTypes = new Set(draft.accountTypes || [])
      let matched = store.pubList.filter(
        item =>
          targetTypes.has(item.account.type)
          && item.account.status === AccountStatus.USABLE
          && supportsDraft(item.account.type),
      )
      if (matched.length === 0) {
        matched = store.pubList.filter(
          item => item.account.status === AccountStatus.USABLE && supportsDraft(item.account.type),
        )
      }
      if (matched.length === 0 && targetTypes.size > 0) {
        matched = store.pubList.filter(item => targetTypes.has(item.account.type))
      }
      if (matched.length === 0) {
        matched = store.pubList.filter(item => item.account.status === AccountStatus.USABLE)
      }
      if (matched.length === 0) {
        matched = [store.pubList[0]]
      }
      store.setPubListChoosed(matched)
      chosen = matched
    }

    // 2. 构建并灌入发布参数（标题、正文+标签、多图或视频）
    const params = await buildPublishParamsFromDraft(draft)
    usePublishDialog.getState().setAccountAllParams(params)

    return {
      applied: true,
      hasAccounts: usePublishDialog.getState().pubList.length > 0,
      matchedCount: chosen.length,
    }
  }
  finally {
    usePublishDialog.getState().setPublishContentLoading(false)
  }
}
