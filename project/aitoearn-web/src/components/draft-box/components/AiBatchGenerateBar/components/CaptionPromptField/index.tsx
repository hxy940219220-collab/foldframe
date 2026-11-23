import { SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { pillClass } from '../ToolBarInline/utils/styles'

interface CaptionPromptFieldProps {
  triggerLabel: string
  active: boolean
  label: string
  tip: string
  placeholder: string
  value: string
  maxLength: number
  onChange: (value: string) => void
}

export function CaptionPromptField({ triggerLabel, active, label, tip, placeholder, value, maxLength, onChange }: CaptionPromptFieldProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`relative ${pillClass}`} type="button">
          <SlidersHorizontal size={14} />{triggerLabel}
          {active && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-brand-cyan" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-4" align="start">
        <label className="flex flex-col gap-2 text-sm font-medium">
          {label}
          <Textarea className="min-h-24 resize-y font-normal" placeholder={placeholder} value={value}
            maxLength={maxLength} onChange={event => onChange(event.target.value)} />
        </label>
        <p className="text-xs leading-5 text-muted-foreground">{tip}</p>
      </PopoverContent>
    </Popover>
  )
}
