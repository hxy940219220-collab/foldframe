import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface CatalogSkill {
  id: string
  name: string
  description: string
  body: string
}

// Compose mounts only the public skills directory. Local Next.js development
// uses the corresponding directory in the same checkout.
export async function readSkillCatalog(): Promise<CatalogSkill[]> {
  const mounted = '/app/agent-skills'
  const checkout = resolve(process.cwd(), '../aitoearn-backend/apps/aitoearn-ai/src/core/agent/skills')
  let root = mounted
  const entries = await readdir(mounted, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT')
      throw error
    root = checkout
    return readdir(checkout, { withFileTypes: true })
  })
  const skills: CatalogSkill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name))
      continue
    const file = join(root, entry.name, 'SKILL.md')
    const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT')
        return null
      throw error
    })
    if (!stat?.isFile())
      continue
    const document = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n')
    const front = document.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
    const metadata = front?.[1] ?? ''
    skills.push({
      id: entry.name,
      name: metadata.match(/^name:\s*(.+)$/m)?.[1].trim() || entry.name,
      description: metadata.match(/^description:\s*(.+)$/m)?.[1].trim() || '',
      body: document.slice(front?.[0].length || 0).trim(),
    })
  }
  return skills.sort((a, b) => a.id.localeCompare(b.id))
}
