import { BRAND_TITLE } from '@/app/config/brand'
import { WechatBrowserOverlay } from '@/components/common/WechatBrowserOverlay'

export const metadata = {
  title: BRAND_TITLE,
  description: BRAND_TITLE,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WechatBrowserOverlay variant="standalone" />
        {children}
      </body>
    </html>
  )
}
