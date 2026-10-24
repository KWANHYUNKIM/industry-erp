-- (세금)계산서발행/수령(E030202) 부서코드 · 프로젝트코드 칸
ALTER TABLE tax_vouchers ADD COLUMN department_id bigint;
ALTER TABLE tax_vouchers ADD COLUMN project_id bigint REFERENCES projects (id);
CREATE INDEX idx_tax_vouchers_project ON tax_vouchers (project_id);
