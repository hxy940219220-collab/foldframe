import { BookOpen } from 'lucide-react'

export function InspirationLink({ label, url }: { label: string, url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="composer-inspiration">
      <BookOpen size={14} />{label}
    </a>
  )
}
