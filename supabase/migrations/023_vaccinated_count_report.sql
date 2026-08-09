-- ============================================================
-- الترحيل 23: تقرير عدد المتطعمين خلال أي مدة (بدون حد 31 يومًا)
--   يعيد إحصاءات مجمّعة لسجلات التطعيم خلال نطاق تاريخ التطعيم:
--     - الإجمالي، الموثّق، غير الموثّق
--     - الذكور/الإناث
--     - مصري/غير مصري (حسب بادئة "مصر" عبر normalize_arabic)
--     - تفصيل الجنسيات (اسم الجنسية + العدد) مرتّبًا تنازليًا
--   الدالة SECURITY INVOKER — RLS مطبّقة تلقائيًا فيبقى عزل المستشفيات
--   ساريًا مهما مرَّر المتصل p_hospital_id (القسم 7/9 من المواصفات).
-- ============================================================

CREATE OR REPLACE FUNCTION vaccinated_count_report(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_hospital_id uuid DEFAULT NULL,
  p_nationality text DEFAULT NULL,
  p_vaccinator_id uuid DEFAULT NULL,
  p_entered_by uuid DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  verified bigint,
  unverified bigint,
  male bigint,
  female bigint,
  egyptian bigint,
  non_egyptian bigint,
  nationality_breakdown jsonb
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT c.*
    FROM child_vaccination_records c
    WHERE c.is_deleted = false
      AND (p_hospital_id IS NULL OR c.hospital_id = p_hospital_id)
      AND (p_from IS NULL OR c.vaccination_date >= p_from)
      AND (p_to IS NULL OR c.vaccination_date <= p_to)
      AND (
        p_nationality IS NULL OR p_nationality = ''
        OR (
          p_nationality = '__NON_EGYPTIAN__'
          AND COALESCE(normalize_arabic(c.child_nationality), '') NOT LIKE 'مصر%'
        )
        OR normalize_arabic(c.child_nationality) LIKE normalize_arabic(p_nationality) || '%'
      )
      AND (p_vaccinator_id IS NULL OR c.vaccinator_id = p_vaccinator_id)
      AND (p_entered_by IS NULL OR c.entered_by = p_entered_by)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_verified = true)::bigint,
    COUNT(*) FILTER (WHERE is_verified = false)::bigint,
    COUNT(*) FILTER (WHERE child_gender = 'male')::bigint,
    COUNT(*) FILTER (WHERE child_gender = 'female')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(normalize_arabic(child_nationality), '') LIKE 'مصر%')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(normalize_arabic(child_nationality), '') NOT LIKE 'مصر%')::bigint,
    COALESCE(
      (
        SELECT jsonb_agg(j ORDER BY j->>'count' DESC, j->>'nationality' ASC)
        FROM (
          SELECT jsonb_build_object(
            'nationality', COALESCE(NULLIF(child_nationality, ''), 'غير محدد'),
            'count', COUNT(*)
          ) AS j
          FROM base
          GROUP BY child_nationality
        ) t
      ),
      '[]'::jsonb
    )
  FROM base;
END;
$$;

REVOKE ALL ON FUNCTION vaccinated_count_report(date, date, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vaccinated_count_report(date, date, uuid, text, uuid, uuid) TO authenticated;
