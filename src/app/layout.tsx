import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "نظام تتبع تطعيم كبدي B للأطفال حديثي الولادة",
  description: "نظام لتتبع توزيع لقاح التهاب الكبد الوبائي (B) للأطفال حديثي الولادة من مخازن وزارة الصحة إلى مستشفيات الولادة",
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
        {children}
      </body>
    </html>
  )
}
