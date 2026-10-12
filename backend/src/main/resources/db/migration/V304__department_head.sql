-- 조직도등록 [부서장지정] · [부서장설정] — 원본 E090222 은 부서마다 부서장 한 명을 두고 격자 [부서장] 열에 '부서장'/'일반'을 찍는다(2026-10-12 loginaa 실측).
-- 사원을 지우면 그 부서는 부서장 없음으로 돌아간다.
ALTER TABLE departments ADD COLUMN head_employee_id bigint;
ALTER TABLE departments ADD CONSTRAINT fk_departments_head_employee_id FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX idx_departments_head_employee_id ON departments (head_employee_id);
