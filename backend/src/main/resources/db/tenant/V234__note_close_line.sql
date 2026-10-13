-- 어음 [내역만등록] 감소 줄의 자기 적요 · 부서 · 프로젝트(원본 감소 격자, 2026-10-13 loginaa 실측). 부서 · 프로젝트는 id 만(FK 없음 — department_id 와 같다).
ALTER TABLE promissory_notes ADD COLUMN close_remark varchar(300);
ALTER TABLE promissory_notes ADD COLUMN close_department_id bigint;
ALTER TABLE promissory_notes ADD COLUMN close_project_id bigint;
