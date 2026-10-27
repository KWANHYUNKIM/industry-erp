-- 일용근로 근무기록확정의 수당 '금액' 열(원본 2026-10-21 E020139): 변동(직접입력) 수당은 근무입력 금액의 합이
-- 근무기록확정(금액) 으로 들어가 급여대장 금액이 된다(QA관리-직접 근무기록 2 · 금액 15,000 → 대장 15,000).
ALTER TABLE daily_work_confirm_items ADD COLUMN amount numeric(15, 0);
