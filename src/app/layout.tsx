import type { Metadata, Viewport } from "next"
import "./globals.css"
import PwaRegister from "@/components/PwaRegister"

export const metadata: Metadata = {
  applicationName: "منظومة التطعيم",
  title: "منظومة تطعيم الكبدي B للرضع — الإدارة الصحية بالعاشر من رمضان",
  description: "منظومة لتتبع تطعيم الأطفال حديثي الولادة ضد الالتهاب الكبدي (B) من مخازن وزارة الصحة إلى مستشفيات الولادة",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "منظومة التطعيم",
    statusBarStyle: "default",
  },
}

// ضبط قياس صريح للمتصفحات على الهواتف: بدون initialScale قد تعرض بعض
// المتصفحات الصفحة بمقاس غير متناسب مع تكبير الكلمات
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d7c08',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
