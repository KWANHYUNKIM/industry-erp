-- 근무조회 이력조회(원본 E090105) 2026-10-13 실측: 이력의 [전표번호] 를 누르면 그때의 근무입력 창(근무일자 · 사원 · 수당항목 ·
-- 단위 · 근무기록)이 열리고, 조건에 근무일자 · 부서가 있다. 전표가 지워져도 보이게 그때의 줄을 JSON 으로 남긴다.
ALTER TABLE public.work_record_histories ADD COLUMN lines_json text;
