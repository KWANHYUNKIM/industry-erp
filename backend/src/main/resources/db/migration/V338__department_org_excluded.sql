-- 원본 조직도등록(E090222, 2026-10-13 실측) Fn › 미포함 — '선택한 항목을 조직도에 미포함 처리하시겠습니까? 하위부서 존재 시
-- 하위부서까지 미포함 처리됩니다.' 부서는 나무에서 빠져 [미포함] 아래로 가고(사원은 그 부서에 그대로), 다시 넣는 길은
-- 다른 부서의 Fn › 하위부서추가(부서검색에 미포함 부서만 뜬다)다. 부서 마스터는 남는다.
ALTER TABLE departments ADD COLUMN org_excluded boolean;
UPDATE departments SET org_excluded = false WHERE org_excluded IS NULL;
ALTER TABLE departments ALTER COLUMN org_excluded SET NOT NULL;
ALTER TABLE departments ALTER COLUMN org_excluded SET DEFAULT false;
