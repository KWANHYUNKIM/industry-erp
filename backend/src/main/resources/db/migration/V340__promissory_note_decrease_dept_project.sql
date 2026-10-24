-- 받을어음 · 지급어음 [내역만등록] 전표구분 [감소] 와 격자 [부서] · [프로젝트] (2026-10-13 loginaa 실측).
-- 감소로 넣은 내역은 분개 없이 어음을 닫는다 — 거래유형 '어음만감소'(RECORD_DECREASED).

ALTER TABLE promissory_notes DROP CONSTRAINT ck_promissory_notes_status;
ALTER TABLE promissory_notes ADD CONSTRAINT ck_promissory_notes_status
    CHECK (status IN ('HELD', 'SETTLED', 'DISCOUNTED', 'DISHONORED', 'RECORD_DECREASED'));

ALTER TABLE promissory_notes ADD COLUMN department_id bigint REFERENCES departments(id);
ALTER TABLE promissory_notes ADD COLUMN project_id bigint REFERENCES projects(id);
CREATE INDEX idx_promissory_notes_department_id ON promissory_notes (department_id);
CREATE INDEX idx_promissory_notes_project_id ON promissory_notes (project_id);
