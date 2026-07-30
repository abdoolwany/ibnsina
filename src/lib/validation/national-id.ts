// التحقق من صحة الرقم القومي المصري حسب القسم 10 من المواصفات

// قائمة أكواد المحافظات للتحقق (تنبيه فقط وليس رفض)
const GOVERNORATE_CODES = new Set([
  '01', '02', '03', '04', '11', '12', '13', '14', '15', '16',
  '17', '18', '19', '21', '22', '23', '24', '25', '26', '27',
  '28', '29', '31', '32', '33', '34', '35', '88',
])

interface NationalIdValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  century: number | null
  birthYear: number | null
  birthMonth: number | null
  birthDay: number | null
  governorateCode: string | null
  gender: 'male' | 'female' | null
}

export function validateEgyptianNationalId(id: string): NationalIdValidationResult {
  const result: NationalIdValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    century: null,
    birthYear: null,
    birthMonth: null,
    birthDay: null,
    governorateCode: null,
    gender: null,
  }

  // التحقق من الطول (14 خانة رقمية)
  if (!/^\d{14}$/.test(id)) {
    result.errors.push('الرقم القومي يجب أن يتكون من 14 خانة رقمية')
    return result
  }

  // القرن: الخانة 1
  const centuryDigit = parseInt(id[0], 10)
  if (centuryDigit !== 2 && centuryDigit !== 3) {
    result.errors.push('الخانة الأولى يجب أن تكون 2 (مواليد 1900-1999) أو 3 (مواليد 2000-2099)')
    return result
  }
  result.century = centuryDigit === 2 ? 1900 : 2000

  // السنة: الخانتان 2-3
  const yearSuffix = parseInt(id.substring(1, 3), 10)
  result.birthYear = result.century + yearSuffix

  // الشهر: الخانتان 4-5
  const month = parseInt(id.substring(3, 5), 10)
  if (month < 1 || month > 12) {
    result.errors.push(`شهر الميلاد غير صحيح: ${month}`)
    return result
  }
  result.birthMonth = month

  // اليوم: الخانتان 6-7
  const day = parseInt(id.substring(5, 7), 10)
  const daysInMonth = new Date(result.birthYear, month, 0).getDate()
  if (day < 1 || day > daysInMonth) {
    result.errors.push(`يوم الميلاد غير صحيح: ${day} (الشهر ${month} في سنة ${result.birthYear} له ${daysInMonth} يوما)`)
    return result
  }
  result.birthDay = day

  // كود المحافظة: الخانتان 8-9 (تنبيه فقط)
  const govCode = id.substring(7, 9)
  result.governorateCode = govCode
  if (!GOVERNORATE_CODES.has(govCode)) {
    result.warnings.push(`كود المحافظة ${govCode} غير معروف في القائمة الشائعة، يرجى التأكد`)
  }

  // الجنس: الخانة 13 (ترقيم من 1)
  // الخانة 13 = id[12] (index 12)
  const genderDigit = parseInt(id[12], 10)
  if (genderDigit % 2 === 1) {
    result.gender = 'male'
  } else {
    result.gender = 'female'
  }

  // الخانة 14: رقم التحقق - لا نتحقق منه حسب المواصفات
  // (رقم تحقق داخلي لوزارة الداخلية غير منشور)

  result.isValid = result.errors.length === 0
  return result
}

// التحقق من تطابق الجنس مع الحقل (أب/أم)
export function checkGenderConsistency(
  nationalId: string,
  expectedGender: 'male' | 'female',
  fieldName: string
): string[] {
  const warnings: string[] = []
  const validation = validateEgyptianNationalId(nationalId)

  if (validation.isValid && validation.gender && validation.gender !== expectedGender) {
    warnings.push(
      `هذا الرقم القومي يشير إلى شخص ${validation.gender === 'male' ? 'ذكر' : 'أنثى'}، بينما الحقل المدخل هو ${fieldName} — يرجى التأكد من الرقم`
    )
  }

  return warnings
}
