import type { MetadataRoute } from "next"

// بيان PWA: يتيح للمتصفح عرض سهم/زر «تثبيت» بجوار رابط الموقع على الهاتف
// وتثبيته كتطبيق مستقل (بند طلب المستخدم). يُقدَّم تلقائيًا على /manifest.webmanifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "منظومة تطعيم الكبدي B للرضع — الإدارة الصحية بالعاشر من رمضان",
    short_name: "منظومة التطعيم",
    description: "منظومة لتتبع تطعيم الأطفال حديثي الولادة ضد الالتهاب الكبدي (B) من مخازن وزارة الصحة إلى مستشفيات الولادة",
    dir: "rtl",
    lang: "ar",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f5f9",
    theme_color: "#0d7c08",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
