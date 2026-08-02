/**
 * التحقق من اسم المستخدم العادي (بدون @).
 * يسمح بأحرف عربية وإنجليزية وأرقام و . _ -
 */
export const USERNAME_REGEX = /^[\p{L}0-9._-]{3,30}$/u

export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') return false
  if (username.includes('@') || username.includes(' ') || username.includes('..')) return false
  return USERNAME_REGEX.test(username)
}

// دالة تجزئة حتمية صغيرة (cyrb53) — تُستخدم لاشتقاق بريد داخلي صالح
// من أسماء مستخدم عربية (Supabase Auth يتطلب بريدًا إلكترونيًا بنطاق ASCII).
// لا نحتاج عكسها: تسجيل الدخول يشتق البريد نفسه من الاسم ذاته.
function hashHex(input: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/**
 * تحويل اسم المستخدم إلى بريد Supabase الداخلي.
 * الأسماء اللاتينية: تُبقى مقروءة (name@vaccine.local).
 * الأسماء العربية (أو أي أحرف غير ASCII): تُشتق منها بريد ASCII صالح
 * من خلال تجزئة حتمية لضمان التفرّد دون تجاوز حدود البريد الإلكتروني.
 */
export function usernameToEmail(username: string): string {
  const u = username.toLowerCase()
  if (/^[a-z0-9._-]{1,64}$/.test(u)) return `${u}@vaccine.local`
  return `u${hashHex(u)}@vaccine.local`
}
