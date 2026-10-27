-- 현금거래 한 장 입력(영수증으로 · 매출처로부터 … 기타출금)의 [부서] · [프로젝트] — 원본 폼 머리, 전표일자 다음 두 칸(2026-10-12 실측).

ALTER TABLE fast_vouchers ADD COLUMN department_id bigint REFERENCES departments(id);
ALTER TABLE fast_vouchers ADD COLUMN project_id bigint REFERENCES projects(id);
CREATE INDEX idx_fast_vouchers_department_id ON fast_vouchers (department_id);
CREATE INDEX idx_fast_vouchers_project_id ON fast_vouchers (project_id);
