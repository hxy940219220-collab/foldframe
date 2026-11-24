'use client'

import type { IDisplayMessage } from '@/store/agent'
import {
  ChevronDown,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Printer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/utils/ui/toast'

export interface ChatExportMenuProps {
  title: string
  messages: IDisplayMessage[]
}

interface NormalizedTurn {
  index: number
  role: 'user' | 'assistant'
  roleLabel: string
  content: string
  timestamp: string
  medias: { url: string, type: string, name?: string }[]
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeFileName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || 'PostPilot-创作策划汇总'
}

function formatDateStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeTurns(messages: IDisplayMessage[]): NormalizedTurn[] {
  const valid = messages.filter(m => m.role === 'user' || m.role === 'assistant')
  return valid.map((msg, idx) => {
    const stepTexts = (msg.steps || [])
      .map(s => s.content?.trim())
      .filter((s): s is string => Boolean(s))
    const primary = msg.content?.trim() || ''
    let fullContent = primary
    if (stepTexts.length > 0) {
      const merged = stepTexts.join('\n\n')
      if (!primary) {
        fullContent = merged
      }
      else if (!merged.includes(primary) && !primary.includes(merged)) {
        fullContent = `${merged}\n\n${primary}`
      }
      else if (merged.length > primary.length) {
        fullContent = merged
      }
    }

    const mediaMap = new Map<string, { url: string, type: string, name?: string }>()
    for (const m of msg.medias || []) {
      if (m?.url) mediaMap.set(m.url, { url: m.url, type: m.type || 'image', name: m.name })
    }
    for (const step of msg.steps || []) {
      for (const m of step.medias || []) {
        if (m?.url) mediaMap.set(m.url, { url: m.url, type: m.type || 'image', name: m.name })
      }
    }

    return {
      index: idx + 1,
      role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      roleLabel: msg.role === 'user' ? '用户需求' : 'AI 策划输出',
      content: fullContent,
      timestamp: msg.createdAt ? formatDateStamp(new Date(msg.createdAt)) : '',
      medias: Array.from(mediaMap.values()),
    }
  }).filter(turn => Boolean(turn.content) || turn.medias.length > 0)
}

function inlineMarkdownToHtml(text: string): string {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  return out
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    // Markdown table
    if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      const parseRow = (row: string) =>
        row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
      const headers = parseRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(parseRow(lines[i]))
        i += 1
      }
      const thead = `<thead><tr>${headers.map(h => `<th>${inlineMarkdownToHtml(h)}</th>`).join('')}</tr></thead>`
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMarkdownToHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
      blocks.push(`<table>${thead}${tbody}</table>`)
      continue
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length + 1)
      blocks.push(`<h${level}>${inlineMarkdownToHtml(headingMatch[2])}</h${level}>`)
      i += 1
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push('<hr />')
      i += 1
      continue
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push(`<blockquote>${quoteLines.map(inlineMarkdownToHtml).join('<br />')}</blockquote>`)
      continue
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i += 1
      }
      blocks.push(`<ul>${items.map(item => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</ul>`)
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push(`<ol>${items.map(item => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</ol>`)
      continue
    }

    // Paragraph
    const paraLines: string[] = []
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !/^(#{1,4}\s+|[-*+]\s+|\d+\.\s+|>|```|[-*_]{3,}$)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim())
      i += 1
    }
    blocks.push(`<p>${paraLines.map(inlineMarkdownToHtml).join('<br />')}</p>`)
  }

  return blocks.join('\n')
}

function buildStyledDocumentHtml(title: string, turns: NormalizedTurn[], forWord = false): string {
  const exportedAt = formatDateStamp()
  const safeTitle = escapeHtml(title)
  const sectionsHtml = turns.map((turn) => {
    const isUser = turn.role === 'user'
    const mediaHtml = turn.medias.length > 0
      ? `<div class="media-list">${turn.medias.map((m, idx) => (
          m.type === 'image' && !forWord
            ? `<div class="media-item"><img src="${escapeHtml(m.url)}" alt="素材 ${idx + 1}" /></div>`
            : `<div class="media-link">📎 附件 ${idx + 1}（${escapeHtml(m.type)}）：<a href="${escapeHtml(m.url)}">${escapeHtml(m.name || m.url)}</a></div>`
        )).join('')}</div>`
      : ''

    return `
      <section class="turn ${isUser ? 'turn-user' : 'turn-ai'}">
        <div class="turn-meta">
          <span class="badge ${isUser ? 'badge-user' : 'badge-ai'}">#${turn.index} · ${escapeHtml(turn.roleLabel)}</span>
          ${turn.timestamp ? `<span class="time">${escapeHtml(turn.timestamp)}</span>` : ''}
        </div>
        <div class="turn-body">
          ${markdownToHtml(turn.content)}
          ${mediaHtml}
        </div>
      </section>`
  }).join('\n')

  const docAttrs = forWord
    ? 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"'
    : 'lang="zh-CN"'

  return `<!DOCTYPE html>
<html ${docAttrs}>
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle} - PostPilot 创作汇总</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
      color: #18181b;
      background: #ffffff;
      margin: 0;
      padding: 36px 28px;
      line-height: 1.72;
      font-size: 14px;
    }
    .page { max-width: 860px; margin: 0 auto; }
    .doc-header {
      border-bottom: 2px solid #4f46e5;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .brand { font-size: 12px; color: #4f46e5; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    h1 { margin: 6px 0 8px; font-size: 24px; color: #111827; line-height: 1.35; }
    .meta { font-size: 12px; color: #6b7280; }
    .turn {
      margin-bottom: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px 20px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .turn-user { background: #f8f7ff; border-color: #ddd6fe; }
    .turn-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-user { background: #ede9fe; color: #4338ca; }
    .badge-ai { background: #f3f4f6; color: #374151; }
    .time { font-size: 11px; color: #9ca3af; }
    .turn-body h2 { font-size: 17px; margin: 14px 0 8px; color: #111827; }
    .turn-body h3 { font-size: 15px; margin: 12px 0 6px; color: #1f2937; }
    .turn-body h4 { font-size: 14px; margin: 10px 0 4px; color: #374151; }
    .turn-body p { margin: 8px 0; }
    .turn-body ul, .turn-body ol { margin: 8px 0; padding-left: 22px; }
    .turn-body li { margin: 4px 0; }
    .turn-body blockquote {
      margin: 10px 0;
      padding: 10px 14px;
      border-left: 3px solid #6366f1;
      background: #f5f3ff;
      color: #312e81;
      border-radius: 0 8px 8px 0;
    }
    .turn-body code {
      background: #f3f4f6;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12.5px;
    }
    .turn-body pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
    }
    .turn-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }
    .turn-body th, .turn-body td {
      border: 1px solid #d1d5db;
      padding: 8px 10px;
      text-align: left;
    }
    .turn-body th { background: #f3f4f6; font-weight: 600; }
    .media-list { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 10px; }
    .media-item img { max-width: 240px; max-height: 240px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .media-link { font-size: 12px; color: #4b5563; width: 100%; word-break: break-all; }
    @media print {
      body { padding: 12px; }
      .turn { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="doc-header">
      <div class="brand">PostPilot · 创作策划导出汇总</div>
      <h1>${safeTitle}</h1>
      <div class="meta">导出时间：${exportedAt} · 共 ${turns.length} 轮内容记录</div>
    </header>
    <main>${sectionsHtml}</main>
  </div>
</body>
</html>`
}

function buildCsvContent(title: string, turns: NormalizedTurn[]): string {
  const esc = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`
  const header = ['序号', '角色', '时间', '主题摘要', '完整文案内容', '附件媒体链接']
  const rows = turns.map((turn) => {
    const firstLine = turn.content.split('\n').find(l => l.trim())?.replace(/^[#>*\-\d.\s]+/, '').slice(0, 60) || title
    const mediaUrls = turn.medias.map(m => m.url).join(' ; ')
    return [
      String(turn.index),
      turn.roleLabel,
      turn.timestamp || formatDateStamp(),
      firstLine,
      turn.content,
      mediaUrls,
    ].map(esc).join(',')
  })
  return `\uFEFF${[header.map(esc).join(','), ...rows].join('\r\n')}`
}

function buildMarkdownContent(title: string, turns: NormalizedTurn[]): string {
  const exportedAt = formatDateStamp()
  const parts = [
    `# ${title}`,
    '',
    `> 导出自 PostPilot · 导出时间：${exportedAt} · 共 ${turns.length} 条记录`,
    '',
    '---',
    '',
  ]
  for (const turn of turns) {
    parts.push(`## ${turn.index}. ${turn.roleLabel}${turn.timestamp ? `（${turn.timestamp}）` : ''}`)
    parts.push('')
    parts.push(turn.content)
    if (turn.medias.length > 0) {
      parts.push('')
      parts.push('**关联素材：**')
      for (const m of turn.medias) {
        parts.push(`- [${m.name || m.type}](${m.url})`)
      }
    }
    parts.push('')
  }
  return parts.join('\n')
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function ChatExportMenu({ title, messages }: ChatExportMenuProps) {
  const [open, setOpen] = useState(false)
  const turns = useMemo(() => normalizeTurns(messages), [messages])
  const baseName = sanitizeFileName(title)

  const ensureHasContent = () => {
    if (turns.length === 0) {
      toast.warning('当前对话暂无可导出的内容')
      return false
    }
    return true
  }

  const handleExportWord = () => {
    if (!ensureHasContent()) return
    const html = buildStyledDocumentHtml(title || 'PostPilot 创作汇总', turns, true)
    const blob = new Blob([`\uFEFF${html}`], { type: 'application/msword;charset=utf-8' })
    triggerBlobDownload(blob, `${baseName}.doc`)
    setOpen(false)
    toast.success('已导出 Word 文档 (.doc)')
  }

  const handleExportPdf = () => {
    if (!ensureHasContent()) return
    const html = buildStyledDocumentHtml(title || 'PostPilot 创作汇总', turns, false)
    const printWin = window.open('', '_blank', 'width=960,height=780')
    if (!printWin) {
      // 浏览器拦截弹窗时降级直接下载可打印 HTML
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      triggerBlobDownload(blob, `${baseName}-打印PDF.html`)
      setOpen(false)
      toast.info('已下载打印版 HTML，打开后按 Ctrl/Cmd+P 即可另存为 PDF')
      return
    }
    printWin.document.open()
    printWin.document.write(html)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => {
      try {
        printWin.print()
      }
      catch {}
    }, 350)
    setOpen(false)
    toast.success('已打开 PDF 排版打印视图，请选择「另存为 PDF」')
  }

  const handleExportHtml = () => {
    if (!ensureHasContent()) return
    const html = buildStyledDocumentHtml(title || 'PostPilot 创作汇总', turns, false)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    triggerBlobDownload(blob, `${baseName}.html`)
    setOpen(false)
    toast.success('已导出 HTML 网页文档 (.html)')
  }

  const handleExportCsv = () => {
    if (!ensureHasContent()) return
    const csv = buildCsvContent(title || 'PostPilot 创作汇总', turns)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    triggerBlobDownload(blob, `${baseName}.csv`)
    setOpen(false)
    toast.success('已导出 Excel 表格 (.csv)')
  }

  const handleExportMarkdown = () => {
    if (!ensureHasContent()) return
    const md = buildMarkdownContent(title || 'PostPilot 创作汇总', turns)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    triggerBlobDownload(blob, `${baseName}.md`)
    setOpen(false)
    toast.success('已导出 Markdown 文档 (.md)')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          data-testid="chat-export-trigger"
          className="ml-1 flex h-8 items-center gap-1 px-2.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Download className="h-4.5 w-4.5" />
          <span>导出</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 rounded-2xl border border-border p-1.5 shadow-xl">
        <div className="px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
          打包汇总并下载（共 {turns.length} 轮内容）
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            data-testid="chat-export-word"
            onClick={handleExportWord}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/75 cursor-pointer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">Word 文档 (.doc)</div>
              <div className="truncate text-[10.5px] text-muted-foreground">保留标题与排版，Word / WPS 直开</div>
            </div>
          </button>

          <button
            type="button"
            data-testid="chat-export-pdf"
            onClick={handleExportPdf}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/75 cursor-pointer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
              <Printer className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">PDF 文档 (.pdf)</div>
              <div className="truncate text-[10.5px] text-muted-foreground">纯净排版打印视图，一键另存 PDF</div>
            </div>
          </button>

          <button
            type="button"
            data-testid="chat-export-html"
            onClick={handleExportHtml}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/75 cursor-pointer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <FileCode2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">HTML 网页 (.html)</div>
              <div className="truncate text-[10.5px] text-muted-foreground">单文件美观排版，离线浏览器可看</div>
            </div>
          </button>

          <button
            type="button"
            data-testid="chat-export-csv"
            onClick={handleExportCsv}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/75 cursor-pointer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">Excel 表格 (.csv)</div>
              <div className="truncate text-[10.5px] text-muted-foreground">按轮次结构化整理，适配 Excel</div>
            </div>
          </button>

          <button
            type="button"
            data-testid="chat-export-md"
            onClick={handleExportMarkdown}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/75 cursor-pointer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">Markdown (.md)</div>
              <div className="truncate text-[10.5px] text-muted-foreground">原始结构文本，适配飞书 / Notion</div>
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ChatExportMenu
