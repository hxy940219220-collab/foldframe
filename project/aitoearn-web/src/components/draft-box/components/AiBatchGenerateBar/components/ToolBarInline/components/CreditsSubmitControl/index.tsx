import type { CreditsSubmitControlProps } from '../../types'
import { ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/utils/className'

export function CreditsSubmitControl({
  label,
  isLoading,
  onSubmit,
}: CreditsSubmitControlProps) {
  return (
    <button
      data-testid="draftbox-ai-submit-btn"
      type="button"
      className={cn(
        'studio-generate',
        isLoading && 'pointer-events-none opacity-60',
      )}
      disabled={isLoading}
      onClick={onSubmit}
    >
      {label}
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowUp className="h-4 w-4" />
      )}
    </button>
  )
}
