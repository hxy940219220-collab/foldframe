import { ImagePlus } from 'lucide-react'
import styles from '../../styles/AiBatchGenerateBar.module.scss'

interface DragUploadOverlayProps {
  label: string
}

export function DragUploadOverlay({ label }: DragUploadOverlayProps) {
  return (
    <div className={styles.overlay}>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <ImagePlus className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  )
}
