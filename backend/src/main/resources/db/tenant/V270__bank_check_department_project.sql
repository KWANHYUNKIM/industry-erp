-- 수령(발행)수표내역입력 줄의 [부서] · [프로젝트] (원본 E060603 신규 창 · 수표거래내역 [부서명] · [프로젝트명], 2026-10-14 loginaa 실측).
-- 부서는 엔티티에서 Long id(accounting → hr 부채 간선을 늘리지 않음), 프로젝트는 @ManyToOne. bond_lines(V305) 와 같은 꼴.
ALTER TABLE bank_checks ADD COLUMN department_id bigint REFERENCES departments(id);
ALTER TABLE bank_checks ADD COLUMN project_id bigint REFERENCES projects(id);
CREATE INDEX idx_bank_checks_department_id ON bank_checks (department_id);
CREATE INDEX idx_bank_checks_project_id ON bank_checks (project_id);
