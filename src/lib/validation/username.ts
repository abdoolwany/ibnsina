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

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@vaccine.local`
}
