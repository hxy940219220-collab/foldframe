'use client'

import { Check, Crop, Loader2, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'

export interface CropResult {
  blob: Blob
  previewUrl: string
  width: number
  height: number
  cropBox: NormalizedRect
}

export interface NormalizedRect {
  x: number // 0..1 relative to natural image width
  y: number // 0..1 relative to natural image height
  w: number // 0..1
  h: number // 0..1
}

interface RatioPreset {
  id: string
  label: string
  ratio: number | null // null = free
}

interface ImageCropModalProps {
  open: boolean
  imageUrl: string
  /** Recommended target ratio from current platform, e.g. '3:4', '9:16', '4:5' */
  recommendedRatioLabel: string
  recommendedRatioValue: number
  initialCrop?: NormalizedRect | null
  onClose: () => void
  onResetOriginal: () => void
  onApply: (result: CropResult) => Promise<void> | void
}

type DragHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const MIN_SIZE_NORM = 0.12

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function fitCenteredRect(naturalW: number, naturalH: number, targetRatio: number): NormalizedRect {
  if (!naturalW || !naturalH) return { x: 0, y: 0, w: 1, h: 1 }
  const imgRatio = naturalW / naturalH
  if (imgRatio > targetRatio) {
    // Image is wider than target -> crop width
    const w = clamp(targetRatio / imgRatio, MIN_SIZE_NORM, 1)
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  else {
    // Image is taller than target -> crop height
    const h = clamp(imgRatio / targetRatio, MIN_SIZE_NORM, 1)
    return { x: 0, y: (1 - h) / 2, w: 1, h }
  }
}

export function ImageCropModal({
  open,
  imageUrl,
  recommendedRatioLabel,
  recommendedRatioValue,
  initialCrop,
  onClose,
  onResetOriginal,
  onApply,
}: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [natural, setNatural] = useState<{ w: number, h: number }>({ w: 0, h: 0 })
  const [selectedPreset, setSelectedPreset] = useState<string>('recommended')
  const [rect, setRect] = useState<NormalizedRect>({ x: 0, y: 0, w: 1, h: 1 })
  const [applying, setApplying] = useState(false)

  const dragRef = useRef<{
    handle: DragHandle
    startClientX: number
    startClientY: number
    startRect: NormalizedRect
    imgWidthPx: number
    imgHeightPx: number
  } | null>(null)

  const presets = useMemo<RatioPreset[]>(() => {
    const list: RatioPreset[] = [
      { id: 'recommended', label: `平台适配 (${recommendedRatioLabel})`, ratio: recommendedRatioValue },
      { id: 'free', label: '自由框选', ratio: null },
      { id: '3:4', label: '3:4 竖图', ratio: 3 / 4 },
      { id: '9:16', label: '9:16 竖屏', ratio: 9 / 16 },
      { id: '4:5', label: '4:5 画廊', ratio: 4 / 5 },
      { id: '1:1', label: '1:1 方图', ratio: 1 },
      { id: '4:3', label: '4:3 横图', ratio: 4 / 3 },
      { id: '16:9', label: '16:9 横屏', ratio: 16 / 9 },
    ]
    // Deduplicate same ratio label as recommended
    return list.filter((p, idx) => idx < 2 || p.id !== recommendedRatioLabel)
  }, [recommendedRatioLabel, recommendedRatioValue])

  const activeAspectRatio = useMemo(() => {
    return presets.find(p => p.id === selectedPreset)?.ratio ?? null
  }, [presets, selectedPreset])

  useEffect(() => {
    if (!open) return
    setSelectedPreset('recommended')
  }, [open, imageUrl, recommendedRatioLabel])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const nw = e.currentTarget.naturalWidth
    const nh = e.currentTarget.naturalHeight
    setNatural({ w: nw, h: nh })
    if (initialCrop) {
      setRect(initialCrop)
    }
    else {
      setRect(fitCenteredRect(nw, nh, recommendedRatioValue))
    }
  }

  const applyPreset = (preset: RatioPreset) => {
    setSelectedPreset(preset.id)
    if (!natural.w || !natural.h) return
    if (preset.ratio === null) return
    setRect(fitCenteredRect(natural.w, natural.h, preset.ratio))
  }

  const startDrag = (e: React.MouseEvent, handle: DragHandle) => {
    e.preventDefault()
    e.stopPropagation()
    const imgEl = imgRef.current
    if (!imgEl) return
    const bounds = imgEl.getBoundingClientRect()
    dragRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: { ...rect },
      imgWidthPx: bounds.width || 1,
      imgHeightPx: bounds.height || 1,
    }
  }

  useEffect(() => {
    if (!open) return

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = (e.clientX - drag.startClientX) / drag.imgWidthPx
      const dy = (e.clientY - drag.startClientY) / drag.imgHeightPx
      const s = drag.startRect
      const imgRatio = natural.w && natural.h ? natural.w / natural.h : 1

      if (drag.handle === 'move') {
        const nx = clamp(s.x + dx, 0, 1 - s.w)
        const ny = clamp(s.y + dy, 0, 1 - s.h)
        setRect({ ...s, x: nx, y: ny })
        return
      }

      let left = s.x
      let top = s.y
      let right = s.x + s.w
      let bottom = s.y + s.h

      if (drag.handle.includes('w')) left = clamp(s.x + dx, 0, right - MIN_SIZE_NORM)
      if (drag.handle.includes('e')) right = clamp(s.x + s.w + dx, left + MIN_SIZE_NORM, 1)
      if (drag.handle.includes('n')) top = clamp(s.y + dy, 0, bottom - MIN_SIZE_NORM)
      if (drag.handle.includes('s')) bottom = clamp(s.y + s.h + dy, top + MIN_SIZE_NORM, 1)

      let w = right - left
      let h = bottom - top

      if (activeAspectRatio !== null) {
        // Maintain exact pixel aspect ratio: (w * natural.w) / (h * natural.h) = activeAspectRatio
        // => w / h = activeAspectRatio / imgRatio
        const normAspect = activeAspectRatio / imgRatio
        const preferWidth = drag.handle === 'e' || drag.handle === 'w' || Math.abs(dx) >= Math.abs(dy)

        if (preferWidth) {
          h = w / normAspect
          if (drag.handle.includes('n')) {
            top = bottom - h
          }
          else {
            bottom = top + h
          }
          if (top < 0) {
            top = 0
            h = bottom - top
            w = h * normAspect
            if (drag.handle.includes('w')) left = right - w
            else right = left + w
          }
          if (bottom > 1) {
            bottom = 1
            h = bottom - top
            w = h * normAspect
            if (drag.handle.includes('w')) left = right - w
            else right = left + w
          }
        }
        else {
          w = h * normAspect
          if (drag.handle.includes('w')) {
            left = right - w
          }
          else {
            right = left + w
          }
          if (left < 0) {
            left = 0
            w = right - left
            h = w / normAspect
            if (drag.handle.includes('n')) top = bottom - h
            else bottom = top + h
          }
          if (right > 1) {
            right = 1
            w = right - left
            h = w / normAspect
            if (drag.handle.includes('n')) top = bottom - h
            else bottom = top + h
          }
        }
      }

      left = clamp(left, 0, 1 - MIN_SIZE_NORM)
      top = clamp(top, 0, 1 - MIN_SIZE_NORM)
      w = clamp(right - left, MIN_SIZE_NORM, 1 - left)
      h = clamp(bottom - top, MIN_SIZE_NORM, 1 - top)
      setRect({ x: left, y: top, w, h })
    }

    const handleMouseUp = () => {
      dragRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [open, activeAspectRatio, natural.w, natural.h])

  const outputPixels = useMemo(() => {
    if (!natural.w || !natural.h) return { w: 0, h: 0 }
    return {
      w: Math.max(1, Math.round(rect.w * natural.w)),
      h: Math.max(1, Math.round(rect.h * natural.h)),
    }
  }, [natural.h, natural.w, rect.h, rect.w])

  const handleConfirm = useCallback(async () => {
    if (!natural.w || !natural.h) return
    setApplying(true)
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('加载原图失败，无法裁剪'))
        img.src = imageUrl
      })

      const sx = Math.round(rect.x * img.naturalWidth)
      const sy = Math.round(rect.y * img.naturalHeight)
      const sw = Math.max(1, Math.round(rect.w * img.naturalWidth))
      const sh = Math.max(1, Math.round(rect.h * img.naturalHeight))

      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('浏览器 Canvas 上下文不可用')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('导出裁剪图片失败'))),
          'image/png',
          0.95,
        )
      })

      const previewUrl = URL.createObjectURL(blob)
      await onApply({
        blob,
        previewUrl,
        width: sw,
        height: sh,
        cropBox: rect,
      })
      onClose()
    }
    catch (err) {
      console.error('Crop failed:', err)
      throw err
    }
    finally {
      setApplying(false)
    }
  }, [imageUrl, natural.h, natural.w, onApply, onClose, rect])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !applying) onClose()
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">拖动框选与自由裁剪</h3>
            {natural.w > 0 && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                原图 {natural.w}×{natural.h} → 裁剪区 {outputPixels.w}×{outputPixels.h}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 比例预设栏 */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-muted/30 px-5 py-2.5">
          {presets.map((p) => {
            const active = selectedPreset === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            )
          })}
          <span className="ml-auto text-[11px] text-muted-foreground">
            拖动选框移动位置，拖拽四角/四边自由调整范围（始终保留原图）
          </span>
        </div>

        {/* 中间原图 + 裁剪框舞台 */}
        <div
          ref={stageRef}
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-950/90 p-6 select-none min-h-[360px]"
        >
          <div className="relative inline-block max-h-[60vh] max-w-full leading-none">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="裁剪原图"
              crossOrigin="anonymous"
              draggable={false}
              onLoad={handleImageLoad}
              className="block max-h-[60vh] max-w-full w-auto h-auto object-contain"
            />

            {/* 裁剪框遮罩与选区 */}
            {natural.w > 0 && (
              <div
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.56)',
                }}
                onMouseDown={e => startDrag(e, 'move')}
                className="absolute cursor-move border-2 border-white"
              >
                {/* 九宫格辅助线 */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/35" />
                  <div className="border-r border-b border-white/35" />
                  <div className="border-b border-white/35" />
                  <div className="border-r border-b border-white/35" />
                  <div className="border-r border-b border-white/35" />
                  <div className="border-b border-white/35" />
                  <div className="border-r border-white/35" />
                  <div className="border-r border-white/35" />
                  <div />
                </div>

                {/* 四角手柄 */}
                <div onMouseDown={e => startDrag(e, 'nw')} className="absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-white shadow" />
                <div onMouseDown={e => startDrag(e, 'ne')} className="absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-sm border-2 border-primary bg-white shadow" />
                <div onMouseDown={e => startDrag(e, 'sw')} className="absolute -bottom-2 -left-2 h-4 w-4 cursor-nesw-resize rounded-sm border-2 border-primary bg-white shadow" />
                <div onMouseDown={e => startDrag(e, 'se')} className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-white shadow" />

                {/* 四边手柄 */}
                <div onMouseDown={e => startDrag(e, 'n')} className="absolute left-1/2 -top-1.5 h-3 w-8 -translate-x-1/2 cursor-ns-resize rounded-full bg-white/95 shadow" />
                <div onMouseDown={e => startDrag(e, 's')} className="absolute left-1/2 -bottom-1.5 h-3 w-8 -translate-x-1/2 cursor-ns-resize rounded-full bg-white/95 shadow" />
                <div onMouseDown={e => startDrag(e, 'w')} className="absolute top-1/2 -left-1.5 h-8 w-3 -translate-y-1/2 cursor-ew-resize rounded-full bg-white/95 shadow" />
                <div onMouseDown={e => startDrag(e, 'e')} className="absolute top-1/2 -right-1.5 h-8 w-3 -translate-y-1/2 cursor-ew-resize rounded-full bg-white/95 shadow" />
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between border-t border-border bg-card px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={applying}
            onClick={() => {
              onResetOriginal()
              onClose()
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            还原为完整原图
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" className="text-xs" disabled={applying} onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={applying || natural.w === 0}
              onClick={() => void handleConfirm()}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {applying ? '正在应用裁剪…' : '确认裁剪并预览'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
