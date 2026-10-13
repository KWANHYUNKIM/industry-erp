-- 회계전표 줄의 [부서] · [프로젝트]. 원본(2026-10-13 loginaa 실측): 영수증으로 [부서 개발팀] 저장 → 전표 26/10/13-5 인쇄에서
-- 차) 복리후생비(판) 3,000 · 대) 현금 3,000 두 줄 모두 적요 칸에 '개발팀'. 장부 · 재무제표 · 경영자료가 부서 · 프로젝트로 거른다.
-- 줄이 hr · inventory 를 참조하지 않으려 id 만 든다(fast_vouchers.department_id 와 같은 방식).

ALTER TABLE journal_lines ADD COLUMN department_id bigint REFERENCES departments(id);
ALTER TABLE journal_lines ADD COLUMN project_id bigint REFERENCES projects(id);
CREATE INDEX idx_journal_lines_department_id ON journal_lines (department_id);
CREATE INDEX idx_journal_lines_project_id ON journal_lines (project_id);
