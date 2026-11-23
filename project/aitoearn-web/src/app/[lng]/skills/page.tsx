/** 技能管理：从当前版本内置的 Agent 技能文件读取目录。 */
import type { PageParams } from '@/app/globals'
import { useTranslation } from '@/app/i18n'
import { readSkillCatalog } from './catalog'
import SkillCatalog from './SkillCatalog'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageParams) {
  const { lng } = await params
  const { t } = await useTranslation(lng, 'skills')
  return { title: t('title') }
}

export default async function Page() {
  const catalog = await readSkillCatalog().catch((error: NodeJS.ErrnoException) => {
    console.error('Could not read bundled Agent skills', error.code)
    return null
  })
  return <SkillCatalog catalog={catalog} />
}
