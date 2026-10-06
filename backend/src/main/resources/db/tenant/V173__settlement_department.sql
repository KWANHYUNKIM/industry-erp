-- 수금 · 지급의 [부서] — 원본 '매출처로부터'/'매입처로' 창의 둘째 칸이고, 수금현황 · 지급현황 조건의 [부서]다(2026-10-06 loginaa 실측).
ALTER TABLE settlements ADD COLUMN department_id bigint;
ALTER TABLE settlements ADD CONSTRAINT fk_settlements_department_id FOREIGN KEY (department_id) REFERENCES departments(id);
CREATE INDEX idx_settlements_department_id ON settlements (department_id);
