"use client"

import { useEffect } from "react"

// تسجيل الـ Service Worker لتفعيل تثبيت التطبيق (PWA). يُسجَّل في بيئة الإنتاج فقط
// لأن Next في بيئة التطوير قد يعيد تحميل الصفحات بسرعة ويسبب تداخلًا.
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
    if (document.readyState === "complete") onLoad()
    else window.addEventListener("load", onLoad)
    return () => window.removeEventListener("load", onLoad)
  }, [])

  return null
}
