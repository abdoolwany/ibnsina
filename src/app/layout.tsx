import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "نظام تتبع توزيع اللقاحات",
  description: "نظام لتتبع سلسلة توزيع اللقاحات من مخازن وزارة الصحة إلى مستشفيات الولادة",
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
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
