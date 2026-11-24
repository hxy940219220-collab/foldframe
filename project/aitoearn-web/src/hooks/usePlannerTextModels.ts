'use client'

import type { DraftTextModelGroup, DraftTextModelOption } from '@/api/ai/ai.api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGetDraftTextModels } from '@/api/ai/ai.api'

const PLANNER_TEXT_MODEL_STORAGE_KEY = 'postpilot:planner-text-model'
const LEGACY_TEXT_MODEL_STORAGE_KEY = 'foldframe:draft-text-model'

let cachedModels: DraftTextModelOption[] = []
let cachedGroups: DraftTextModelGroup[] = []
let cachedDefaultModel = 'agy:default'
let inflightPromise: Promise<void> | null = null

export function parseContextWindowToTokens(raw?: string | null, modelId?: string | null): number {
  const clean = String(raw || '').trim().toUpperCase()
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*([MK])?$/i)
  if (match) {
    const num = Number(match[1])
    const unit = (match[2] || '').toUpperCase()
    if (Number.isFinite(num) && num > 0) {
      if (unit === 'M') return Math.round(num * 1_000_000)
      if (unit === 'K') return Math.round(num * 1_000)
      return Math.round(num)
    }
  }
  const probe = String(modelId || '').toLowerCase()
  if (probe.startsWith('agy:')) return 1_000_000
  if (probe.startsWith('codex:')) return 256_000
  if (probe.startsWith('grok:')) return 256_000
  if (probe.startsWith('workbuddy:')) return 200_000
  if (probe.includes('claude')) return 200_000
  if (probe.includes('gemini')) return 1_000_000
  if (probe.includes('deepseek')) return 128_000
  return 200_000
}

export function isLocalFreeTextModel(modelId?: string | null): boolean {
  const value = String(modelId || '').trim().toLowerCase()
  return (
    value.startsWith('agy:')
    || value.startsWith('codex:')
    || value.startsWith('grok:')
    || value.startsWith('workbuddy:')
  )
}

function readStoredModel(): string {
  if (typeof window === 'undefined') return cachedDefaultModel
  try {
    return (
      window.localStorage.getItem(PLANNER_TEXT_MODEL_STORAGE_KEY)
      || window.localStorage.getItem(LEGACY_TEXT_MODEL_STORAGE_KEY)
      || cachedDefaultModel
    )
  }
  catch {
    return cachedDefaultModel
  }
}

export function usePlannerTextModels(initialOverride?: string) {
  const [models, setModels] = useState<DraftTextModelOption[]>(() => cachedModels)
  const [groups, setGroups] = useState<DraftTextModelGroup[]>(() => cachedGroups)
  // 保持 SSR 与首帧 CSR 一致，避免水合前读取 localStorage 触发 React #418/#425
  const [selectedModel, setSelectedModelState] = useState<string>(() => initialOverride || cachedDefaultModel)

  useEffect(() => {
    if (initialOverride) {
      setSelectedModelState(initialOverride)
      return
    }
    const stored = readStoredModel()
    if (stored && stored !== cachedDefaultModel) {
      setSelectedModelState(stored)
    }
  }, [initialOverride])

  useEffect(() => {
    let active = true

    const applyCatalog = () => {
      if (!active || cachedModels.length === 0) return
      setModels(cachedModels)
      setGroups(cachedGroups)
      setSelectedModelState((prev) => {
        const valid = cachedModels.some(
          m => m.value === prev || Boolean(m.effortOptions?.some(e => e.value === prev)),
        )
        return valid ? prev : (cachedDefaultModel || cachedModels[0].value)
      })
    }

    if (cachedModels.length > 0) {
      applyCatalog()
    }

    if (!inflightPromise) {
      inflightPromise = apiGetDraftTextModels()
        .then((res) => {
          if (res?.data?.models?.length) {
            cachedModels = res.data.models
            cachedGroups = res.data.groups || []
            cachedDefaultModel = res.data.defaultModel || res.data.models[0].value
          }
        })
        .catch(() => {})
        .finally(() => {
          inflightPromise = null
        })
    }

    inflightPromise.then(() => applyCatalog())

    return () => {
      active = false
    }
  }, [])

  const setSelectedModel = useCallback((next: string) => {
    setSelectedModelState(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PLANNER_TEXT_MODEL_STORAGE_KEY, next)
      }
      catch {}
    }
  }, [])

  const selectedModelOption = useMemo(() => {
    for (const m of models) {
      if (m.value === selectedModel) return m
      if (m.effortOptions?.some(e => e.value === selectedModel)) return m
    }
    return models[0]
  }, [models, selectedModel])

  const contextWindowTokens = useMemo(
    () => parseContextWindowToTokens(selectedModelOption?.contextWindow, selectedModel),
    [selectedModelOption?.contextWindow, selectedModel],
  )

  return {
    models,
    groups,
    selectedModel,
    setSelectedModel,
    selectedModelOption,
    contextWindowTokens,
  }
}
