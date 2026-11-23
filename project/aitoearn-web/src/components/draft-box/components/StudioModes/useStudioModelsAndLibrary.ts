'use client'

import type { DraftTextModelOption } from '@/api/ai/ai.api'
import type { DraftGenerationTask, ImageModelInfo, VideoModelInfo } from '@/api/ai/ai.types'
import type { MediaItem, PromotionMaterial } from '@/api/materials/material.types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  apiGetDraftGenerationPricing,
  apiGetDraftTextModels,
  apiQueryDraftGenerationTasks,
} from '@/api/ai/ai.api'
import { useMediaTabStore } from '../ContentTabs/mediaTabStore'

export interface StudioCatalogState {
  imageModels: ImageModelInfo[]
  videoModels: VideoModelInfo[]
  textModels: DraftTextModelOption[]
  defaultTextModel: string
  loading: boolean
}

export function useStudioModelsAndLibrary(groupId: string) {
  const [catalog, setCatalog] = useState<StudioCatalogState>({
    imageModels: [],
    videoModels: [],
    textModels: [],
    defaultTextModel: 'agy:default',
    loading: true,
  })

  const { mergedList, initialized, activeMaterialGroupId, reset, fetchAllList, silentRefresh, silentRefreshAll } = useMediaTabStore(
    useShallow(state => ({
      mergedList: state.all.mergedList,
      initialized: state.all.initialized,
      activeMaterialGroupId: state.activeMaterialGroupId,
      reset: state.reset,
      fetchAllList: state.fetchAllList,
      silentRefresh: state.silentRefresh,
      silentRefreshAll: state.silentRefreshAll,
    })),
  )

  useEffect(() => {
    if (!groupId) return
    if (activeMaterialGroupId && activeMaterialGroupId !== groupId) {
      reset(groupId)
      void fetchAllList(groupId, groupId)
    }
    else if (!initialized) {
      void fetchAllList(groupId, groupId)
    }
  }, [groupId, initialized, activeMaterialGroupId, reset, fetchAllList])

  useEffect(() => {
    let active = true
    apiGetDraftGenerationPricing()
      .then((pricingRes) => {
        if (!active) return
        setCatalog(prev => ({
          ...prev,
          imageModels: pricingRes?.data?.imageModels ?? prev.imageModels,
          videoModels: pricingRes?.data?.videoModels ?? prev.videoModels,
          loading: false,
        }))
      })
      .catch(() => {
        if (active) setCatalog(prev => ({ ...prev, loading: false }))
      })

    apiGetDraftTextModels()
      .then((textRes) => {
        if (!active) return
        setCatalog(prev => ({
          ...prev,
          textModels: textRes?.data?.models ?? [
            { value: 'agy:default', label: 'Antigravity CLI (默认)', provider: 'agy', tag: '本机 LLM' },
            { value: 'codex:default', label: 'Codex CLI (默认)', provider: 'codex', tag: '本机 LLM' },
          ],
          defaultTextModel: textRes?.data?.defaultModel || 'agy:default',
        }))
      })
      .catch(() => {
        if (!active) return
        setCatalog(prev => (prev.textModels.length > 0
          ? prev
          : {
              ...prev,
              textModels: [
                { value: 'agy:default', label: 'Antigravity CLI (默认)', provider: 'agy', tag: '本机 LLM' },
                { value: 'codex:default', label: 'Codex CLI (默认)', provider: 'codex', tag: '本机 LLM' },
              ],
            }))
      })

    return () => { active = false }
  }, [])

  const images = useMemo<MediaItem[]>(
    () => mergedList.filter(item => item.source === 'img').map(item => item.data as MediaItem),
    [mergedList],
  )

  const videos = useMemo<MediaItem[]>(
    () => mergedList.filter(item => item.source === 'video').map(item => item.data as MediaItem),
    [mergedList],
  )

  const drafts = useMemo<PromotionMaterial[]>(
    () => mergedList.filter(item => item.source === 'draft').map(item => item.data as PromotionMaterial),
    [mergedList],
  )

  const refreshLibrary = useCallback(async () => {
    if (!groupId) return
    await Promise.all([
      silentRefresh(groupId),
      silentRefreshAll(groupId, groupId),
    ])
  }, [groupId, silentRefresh, silentRefreshAll])

  const pollTaskUntilDone = useCallback(async (
    taskId: string,
    maxWaitMs = 240000,
  ): Promise<DraftGenerationTask> => {
    const deadline = Date.now() + maxWaitMs
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2200))
      try {
        const res = await apiQueryDraftGenerationTasks([taskId])
        const task = res?.data?.[0]
        if (!task) continue
        if (task.status === 'success' || task.status === 'failed') {
          await refreshLibrary()
          return task
        }
      }
      catch {
        // Retry on transient poll error
      }
    }
    throw new Error('生成超时，请稍后在「媒体资源」中查看结果')
  }, [refreshLibrary])

  return {
    catalog,
    mergedList,
    images,
    videos,
    drafts,
    refreshLibrary,
    pollTaskUntilDone,
  }
}
