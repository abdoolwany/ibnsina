// خدمة العامل (Service Worker) — الحد الأدنى المطلوب لإظهار زر «تثبيت التطبيق»
// في متصفحات الجوال (شرط أساسي لتفعيل PWA). لا نضيف تخزينًا مؤقتًا للبيانات الحساسة:
// كل الطلبات تُمرَّر للشبكة مباشرة، والنسخ الاحتياطية للملاحة تُخدم عند انقطاع الاتصال فقط.
const CACHE = 'ibnsina-shell-v1'

self.addEventListener('install', () => {
  // لا ننتظر إغلاق التبويبات القديمة لتفعيل النسخة الجديدة
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  // تخطي طلبات الـ API والمصادقة تمامًا (بيانات حساسة تخص أطفالًا وهويات)
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('/')
      throw new Error('غير متصل')
    }),
  )
})
