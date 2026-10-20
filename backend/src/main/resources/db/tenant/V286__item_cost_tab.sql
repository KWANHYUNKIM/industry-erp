-- 품목등록 [원가] 탭 (원본 C000029, 2026-10-20 실측): 표준노무시간(노무비가중치) 1 · 경비가중치 1 · 재료비표준원가(빈칸)
-- · 경비 · 노무비 · 외주비표준원가 0(원본 창에서 잠긴 칸 — 원가생성이 채운다). 원본 표준원가현황(E040808)이
-- [표준원가생성] 으로 이 값을 옮겨 보여 준다.
ALTER TABLE items ADD COLUMN std_labor_hours numeric(15,4) NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN expense_weight numeric(15,4) NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN material_std_cost numeric(18,2);
ALTER TABLE items ADD COLUMN expense_std_cost numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN labor_std_cost numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN subcontract_std_cost numeric(18,2) NOT NULL DEFAULT 0;
