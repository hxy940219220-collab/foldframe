'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/className'

export interface StudioSelectOption {
  value: string
  label: string
  badge?: string
  isCustom?: boolean
}

interface StudioSelectProps {
  value: string
  options: StudioSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  triggerClassName?: string
  menuMinWidth?: number
  disabled?: boolean
  testId?: string
}

export function StudioSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  className,
  triggerClassName,
  menuMinWidth,
  disabled = false,
  testId,
}: StudioSelectProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
    openUpward: boolean
  } | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updatePosition = () => {
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const estimatedH = Math.min(264, options.length * 36 + 12)
    const spaceBelow = window.innerHeight - rect.bottom - 14
    const spaceAbove = rect.top - 14
    const openUpward = spaceBelow < Math.min(estimatedH, 180) && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.min(272, (openUpward ? spaceAbove : spaceBelow) - 6))
    const width = Math.max(rect.width, menuMinWidth ?? 0)
    const maxLeft = window.innerWidth - width - 12
    setMenuPos({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, maxLeft)),
      width,
      maxHeight,
      openUpward,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const onResizeOrScroll = () => updatePosition()
    window.addEventListener('resize', onResizeOrScroll)
    window.addEventListener('scroll', onResizeOrScroll, true)
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectedOption = options.find(o => o.value === value)
  const displayLabel = selectedOption?.label || (value ? value : placeholder)

  return (
    <div className={cn('relative inline-flex min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) setOpen(v => !v)
        }}
        className={cn(
          'inline-flex h-8 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background pl-3.5 pr-3 text-xs font-medium text-foreground transition-colors hover:border-primary/50 focus:outline-none focus:border-primary disabled:opacity-50 cursor-pointer',
          open && 'border-primary ring-2 ring-primary/15',
          triggerClassName,
        )}
      >
        <span className="truncate text-left">{displayLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {mounted && open && menuPos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          data-canvas-ui="true"
          data-canvas-scroll="true"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
            transform: menuPos.openUpward ? 'translateY(-100%)' : undefined,
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className={cn(
            'z-[120] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl backdrop-blur',
            'animate-in fade-in-0 duration-150 ease-out',
            menuPos.openUpward ? 'slide-in-from-bottom-1.5' : 'slide-in-from-top-1.5',
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <div key={opt.value}>
                {opt.isCustom && <div className="my-1 h-px bg-border/80" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-primary/10 font-semibold text-primary'
                      : opt.isCustom
                        ? 'font-medium text-primary/90 hover:bg-primary/8'
                        : 'text-foreground hover:bg-muted',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{opt.label}</span>
                    {opt.badge && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0 text-[9.5px] font-medium text-muted-foreground">
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              </div>
            )
          })}
          {options.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">暂无可选项</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
