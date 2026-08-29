-- 품질검사요청의 [프로젝트] — 원본 품질검사요청입력의 격자 열.
--
-- 검사(quality_inspections)에는 진작 프로젝트가 있는데 <b>요청에는 없었다.</b>
-- 그래서 프로젝트를 걸어 검사를 요청해도 그 값이 어디에도 안 남고, 요청이 검사로 넘어갈 때
-- 사람이 다시 골라야 했다 — 안 고르면 프로젝트별로 보는 화면에서 그 검사가 사라진다.
--
-- FK 컬럼에는 인덱스를 직접 만든다(CLAUDE.md 7.1).
ALTER TABLE quality_inspection_requests ADD COLUMN project_id bigint;
ALTER TABLE quality_inspection_requests ADD CONSTRAINT fk_quality_requests_project
    FOREIGN KEY (project_id) REFERENCES projects(id);
CREATE INDEX idx_quality_requests_project ON quality_inspection_requests(project_id);
