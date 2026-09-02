-- 업무일지의 프로젝트. 원본 업무일지(E070304) 조회 조건에 있다 —
-- "어느 프로젝트 일인지"로 일지를 찾는다.
ALTER TABLE work_journals ADD COLUMN project_id bigint;
ALTER TABLE work_journals ADD CONSTRAINT fk_work_journals_project
    FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK 컬럼 인덱스는 PostgreSQL 이 자동으로 만들어 주지 않는다(CLAUDE.md 7.1).
CREATE INDEX idx_work_journals_project ON work_journals (project_id);
