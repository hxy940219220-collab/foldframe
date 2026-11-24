import type { PageParams } from '@/app/globals'
import { ArrowLeft, BookOpen, CheckCircle2, FileText, ScrollText, Shield } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/app/i18n'
import { fallbackLng, languages } from '@/app/i18n/settings'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getMetadata } from '@/utils/metadata'

const documents = {
  'privacy-policy': 'privacyPolicy',
  'terms-of-service': 'termsOfService',
  'data-protection-agreement': 'dataProtection',
  'data-deletion': 'dataDeletion',
  'extension-privacy-policy': 'extensionPrivacy',
} as const

type DocumentSlug = keyof typeof documents

interface DocSection {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

interface BuiltinDocContent {
  badge: string
  updatedAt: string
  summary: string
  sections: DocSection[]
}

function getBuiltinContent(slug: DocumentSlug, isZh: boolean): BuiltinDocContent {
  if (slug === 'privacy-policy') {
    return isZh
      ? {
          badge: 'PostPilot 隐私政策',
          updatedAt: '最后更新：2026 年 11 月',
          summary: 'PostPilot 采用本地优先（Local-First）架构设计，致力于在您掌控自有数据与凭证的前提下，提供高效的 AI 视觉创作与多平台社媒发布体验。',
          sections: [
            {
              title: '1. 本地数据存储原则',
              paragraphs: [
                '当您在本地环境运行 PostPilot 时，所有生成的图片、视频、画布节点、多维改图记录、排版草稿及发布待办任务均默认保存在您本机的数据库与对象存储（RustFS）中，PostPilot 不会主动将您的私有创作素材上传至第三方中心服务器。',
              ],
              bullets: [
                '素材与草稿数据：仅存储于您可控的本地实例目录。',
                '界面偏好与布局配置：保存在浏览器本地存储，可随时清空。',
                '无第三方埋点与广告追踪：不向广告网络出售或共享您的任何行为数据。',
              ],
            },
            {
              title: '2. 本机模型引擎与授权凭证隔离',
              paragraphs: [
                'PostPilot 通过仅监听本机回环地址（127.0.0.1）且需要独立令牌鉴权的本地桥接服务调用已安装的官方客户端或 CLI（包括 Antigravity、Codex、即梦 AI、Grok 与 WorkBuddy）。',
              ],
              bullets: [
                '网页扫码或 OAuth 授权均直接跳转对应模型官方域名完成，PostPilot 不记录您的明文密码。',
                'WorkBuddy 登录态采用独立隔离目录，退出 PostPilot 登录不会影响您原有的桌面端会话。',
                '当您选择调用第三方云端 API（OpenAI、Anthropic、Gemini、DeepSeek 等）时，仅在您触发生成任务时将对应提示词或参考图发送至您配置的接口端点。',
              ],
            },
            {
              title: '3. 社交媒体平台连接与发布权限',
              paragraphs: [
                '在您主动绑定小红书、抖音、Instagram 等社媒账号并触发发布时，系统仅在您明确确认的范围内提交标题、正文、标签与媒体文件，不会在未经您操作的情况下自动读取私信或修改与发布无关的账户设置。',
              ],
            },
            {
              title: '4. 您的数据控制权',
              paragraphs: [
                '您随时可以在「AI 模型配置」页面一键退出任一模型登录态，在「素材库 / 发布待办」中删除任意历史素材与草稿，或直接清理本地部署的数据卷以彻底移除全部记录。',
              ],
            },
          ],
        }
      : {
          badge: 'PostPilot Privacy Policy',
          updatedAt: 'Last Updated: November 2026',
          summary: 'PostPilot is engineered with a local-first architecture so your creative assets, drafts, and model credentials remain under your direct control.',
          sections: [
            {
              title: '1. Local-First Asset Storage',
              paragraphs: [
                'When running PostPilot locally, generated images, videos, canvas states, multi-dimensional edits, and scheduled publishing drafts are stored in your own local database and object storage instance rather than uploaded to external PostPilot servers.',
              ],
              bullets: [
                'Creative assets & drafts remain strictly inside your local deployment.',
                'UI preferences are stored in browser local storage and can be cleared anytime.',
                'No ad tracking or third-party behavioral telemetry.',
              ],
            },
            {
              title: '2. Local Model Bridge & Credential Isolation',
              paragraphs: [
                'PostPilot communicates with local CLIs (Antigravity, Codex, Dreamina, Grok, WorkBuddy) over a token-authenticated loopback bridge on 127.0.0.1.',
              ],
              bullets: [
                'Browser sign-in flows happen directly on the official provider domain; PostPilot never stores plaintext passwords.',
                'WorkBuddy auth sessions live in an isolated workspace directory independent from your desktop app.',
                'Third-party API keys are only used to send requests to the endpoints you explicitly configure.',
              ],
            },
            {
              title: '3. Social Platform Connections',
              paragraphs: [
                'Connected social channels are only accessed when you explicitly sync channel metadata or submit a post from your publish queue.',
              ],
            },
            {
              title: '4. Your Data Control',
              paragraphs: [
                'You can sign out of any engine in AI Models, delete assets or drafts directly in the studio, or remove your local data volumes at any time.',
              ],
            },
          ],
        }
  }

  if (slug === 'terms-of-service') {
    return isZh
      ? {
          badge: 'PostPilot 服务条款',
          updatedAt: '最后更新：2026 年 11 月',
          summary: '欢迎使用 PostPilot AI 视觉创作与社媒发布工作台。使用本软件即表示您同意遵守以下使用规范与合规条款。',
          sections: [
            {
              title: '1. 服务范围与定位',
              paragraphs: [
                'PostPilot 是一款面向个人创作者、设计团队与品牌运营的本地优先 AI 内容创作、仿真排版与多平台发布效率工具，提供快捷工作台、无限画布、多维改图、仿真手机排版工坊、发布待办以及本机多模型接入能力。',
              ],
            },
            {
              title: '2. AI 生成内容权属与合规责任',
              paragraphs: [
                '您通过 PostPilot 创作并生成的文案、商业图片、短视频与排版作品归您本人或您所代表的机构所有，同时需遵守所调用底层模型服务商的使用协议及适用法律法规。',
              ],
              bullets: [
                '请勿使用本工具生成违法违规、侵犯他人肖像权/著作权/商标权或误导性的虚假内容。',
                '如将 AI 生成作品用于商业广告或公开传播，请按目标社媒平台要求做好必要的内容合规核验与 AI 标识标注。',
              ],
            },
            {
              title: '3. 第三方模型与社媒平台规则',
              paragraphs: [
                'PostPilot 仅作为效率工作台为您编排本机已授权的模型引擎及社媒发布流程。各第三方模型服务（如 Antigravity、Codex、即梦 AI、Grok、WorkBuddy 及各类第三方 API）与各社媒平台（小红书、抖音、Instagram 等）的额度、可用性与社区规范均由对应服务方独立制定和约束。',
              ],
            },
            {
              title: '4. 免责声明与条款更新',
              paragraphs: [
                '本工作台按「现状」提供。因第三方模型接口波动、目标社媒平台风控策略调整或用户自身网络环境导致的中断与发布延迟，PostPilot 将尽量给出清晰提示，但不对第三方外部服务的连续性作出绝对担保。',
              ],
            },
          ],
        }
      : {
          badge: 'PostPilot Terms of Service',
          updatedAt: 'Last Updated: November 2026',
          summary: 'These terms govern your use of the PostPilot AI visual creation and multi-platform publishing studio.',
          sections: [
            {
              title: '1. Scope of Software',
              paragraphs: [
                'PostPilot provides a local-first workspace for AI copy/image/video generation, Infinite Canvas branching, 6-dimension editing, realistic mobile layout preview, publish queues, and local model orchestration.',
              ],
            },
            {
              title: '2. Content Ownership & Responsible Use',
              paragraphs: [
                'You retain ownership of the copy, images, videos, and layouts you create, subject to the license terms of the underlying AI model providers you invoke.',
              ],
              bullets: [
                'Do not generate unlawful, infringing, deceptive, or harmful content.',
                'Follow AI disclosure and commercial compliance guidelines required by your target publishing platforms.',
              ],
            },
            {
              title: '3. Third-Party Engines & Social Platforms',
              paragraphs: [
                'Quotas, availability, and platform policies for third-party AI engines and connected social networks are governed independently by their respective providers.',
              ],
            },
            {
              title: '4. Disclaimer',
              paragraphs: [
                'PostPilot is provided on an "as-is" basis. We strive to provide clear diagnostics when external model APIs or social platforms change, without guaranteeing third-party uptime.',
              ],
            },
          ],
        }
  }

  if (slug === 'data-deletion') {
    return isZh
      ? {
          badge: '账户与数据删除',
          updatedAt: '最后更新：2026 年 11 月',
          summary: '您对 PostPilot 中的所有本地素材、草稿与模型登录态拥有完全自主清理权。',
          sections: [
            {
              title: '1. 退出本机模型授权',
              paragraphs: [
                '进入「AI 模型配置」页面，针对即梦 AI、Grok 或 WorkBuddy 点击「退出登录」，系统会立即清除对应隔离目录中的本地登录凭证。',
              ],
            },
            {
              title: '2. 删除素材与发布待办',
              paragraphs: [
                '在「内容创作 → AI 生成素材 / 素材库」与「发布待办」中，可直接删除单条或批量移除历史图片、视频和草稿记录。',
              ],
            },
            {
              title: '3. 彻底清空本地部署数据',
              paragraphs: [
                '如需完全重置本地实例，停止 Docker 容器并移除项目本地数据目录与存储卷后，全部数据将被不可逆地从本机清除。',
              ],
            },
          ],
        }
      : {
          badge: 'Account & Data Deletion',
          updatedAt: 'Last Updated: November 2026',
          summary: 'You have full control over deleting local assets, drafts, and model sessions in PostPilot.',
          sections: [
            {
              title: '1. Revoke Local Model Sessions',
              paragraphs: [
                'Open AI Models and click Sign Out on Dreamina, Grok, or WorkBuddy to immediately remove cached local session credentials.',
              ],
            },
            {
              title: '2. Remove Assets & Publishing Drafts',
              paragraphs: [
                'Delete generated images, videos, and scheduled posts directly from the Asset Library and Publish Queue.',
              ],
            },
            {
              title: '3. Full Local Reset',
              paragraphs: [
                'Stopping your local containers and deleting the local data volumes permanently erases all stored studio data.',
              ],
            },
          ],
        }
  }

  if (slug === 'extension-privacy-policy') {
    return isZh
      ? {
          badge: '浏览器扩展隐私说明',
          updatedAt: '最后更新：2026 年 11 月',
          summary: '说明 PostPilot 浏览器发布扩展在连接社媒创作者后台时的最小权限原则。',
          sections: [
            {
              title: '1. 最小化浏览器权限',
              paragraphs: [
                '扩展仅在您主动触发账号同步或发布任务时，与当前受支持的社媒平台创作者页面进行通信，不读取您在无关网站上的浏览历史或表单输入。',
              ],
            },
            {
              title: '2. 本地通信优先',
              paragraphs: [
                '扩展与您本地运行的 PostPilot 工作台直接通信以完成发布状态同步，所有会话状态均由您在本机掌控，可随时在浏览器扩展管理页禁用或卸载。',
              ],
            },
          ],
        }
      : {
          badge: 'Browser Extension Privacy',
          updatedAt: 'Last Updated: November 2026',
          summary: 'Minimal permissions and local-first communication principles for the PostPilot browser extension.',
          sections: [
            {
              title: '1. Minimal Permissions',
              paragraphs: [
                'The extension only interacts with supported creator studio tabs when you explicitly sync an account or trigger a publish task. It never collects unrelated browsing history.',
              ],
            },
            {
              title: '2. Local Session Control',
              paragraphs: [
                'Extension sessions communicate directly with your PostPilot workspace and can be revoked or uninstalled anytime from your browser settings.',
              ],
            },
          ],
        }
  }

  return isZh
    ? {
        badge: 'PostPilot 数据保护说明',
        updatedAt: '最后更新：2026 年 11 月',
        summary: '介绍 PostPilot 在本地桥接通信、对象存储与访问令牌管理方面的安全实践。',
        sections: [
          {
            title: '1. 本地回环隔离与令牌鉴权',
            paragraphs: [
              '宿主机本地模型桥接服务默认仅绑定 127.0.0.1 回环接口，且所有接口均强制校验独立生成的 Bearer Token，防止局域网未授权访问。',
            ],
          },
          {
            title: '2. 最小化外部网络暴露',
            paragraphs: [
              '前端工作台、API 服务与对象存储通过本地反向代理统一编排，您的草稿、参考图和生成作品默认留存在本机环境。',
            ],
          },
        ],
      }
    : {
        badge: 'PostPilot Data Protection',
        updatedAt: 'Last Updated: November 2026',
        summary: 'Security overview of loopback bridge authentication, local object storage, and workspace isolation.',
        sections: [
          {
            title: '1. Loopback Binding & Token Auth',
            paragraphs: [
              'The host local model bridge binds strictly to 127.0.0.1 and enforces Bearer token authentication on every request.',
            ],
          },
          {
            title: '2. Local Storage Isolation',
            paragraphs: [
              'Creative assets, reference images, and drafts remain inside your local Docker network and storage volumes by default.',
            ],
          },
        ],
      }
}

async function getDocumentContext(params: PageParams['params']) {
  const { lng } = await params
  const language = languages.includes(lng) ? lng : fallbackLng
  const { t } = await useTranslation(language, 'websit')
  return { language, t }
}

export async function documentMetadata(params: PageParams['params'], slug: DocumentSlug) {
  const { language, t } = await getDocumentContext(params)
  const key = documents[slug]
  return getMetadata({
    title: t(`${key}.title`),
    description: t(`${key}.description`),
    keywords: t(`${key}.keywords`),
  }, language, `/websit/${slug}`)
}

export async function ProviderDocument({ params, slug }: PageParams & { slug: DocumentSlug }) {
  const { language, t } = await getDocumentContext(params)
  const key = documents[slug]
  const isZh = language.toLowerCase().startsWith('zh')
  const doc = getBuiltinContent(slug, isZh)
  const Icon = slug === 'privacy-policy' || slug === 'data-protection-agreement' || slug === 'extension-privacy-policy'
    ? Shield
    : slug === 'terms-of-service'
      ? ScrollText
      : FileText

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-foreground">
              <Icon className="h-3.5 w-3.5 text-[#6D28D9]" />
              <span>{doc.badge}</span>
            </div>
            <span className="text-xs text-muted-foreground">{doc.updatedAt}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t(`${key}.title`)}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {doc.summary}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/websit/help-docs"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('providerDocument.current')}
            </Link>
            <Link
              href="/"
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t('providerDocument.bundled')}
            </Link>
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-4xl space-y-5 px-6 py-10 md:py-12">
        {doc.sections.map(section => (
          <Card key={section.title} className="border-border p-6 shadow-none">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {section.title}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
              {section.paragraphs.map(p => (
                <p key={p}>{p}</p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="space-y-2 pt-1">
                  {section.bullets.map(item => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-foreground" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        ))}

        {/* 文档页底部快捷导航 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>PostPilot · AI Content Creation &amp; Multi-Platform Publishing Studio</span>
          <div className="flex flex-wrap gap-4">
            <Link href="/websit/help-docs" className="hover:text-foreground hover:underline">
              {isZh ? '帮助文档' : 'Help Docs'}
            </Link>
            <Link href="/websit/plugin-guide" className="hover:text-foreground hover:underline">
              {isZh ? '插件使用教程' : 'Extension Guide'}
            </Link>
            <Link href="/websit/privacy-policy" className="hover:text-foreground hover:underline">
              {isZh ? '隐私政策' : 'Privacy Policy'}
            </Link>
            <Link href="/websit/terms-of-service" className="hover:text-foreground hover:underline">
              {isZh ? '服务条款' : 'Terms of Service'}
            </Link>
          </div>
        </div>
      </article>
    </div>
  )
}
