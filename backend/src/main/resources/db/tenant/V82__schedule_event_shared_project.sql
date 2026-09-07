-- 출퇴근/근태/일정현황(E070308)의 조건 [공유여부]·[프로젝트].
-- 일정에 담을 자리가 없어 두 조건을 만들 수가 없었다.

ALTER TABLE schedule_events ADD COLUMN project_id bigint;
ALTER TABLE schedule_events ADD CONSTRAINT fk_schedule_events_project
    FOREIGN KEY (project_id) REFERENCES projects(id);
-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 만들지 않는다.
CREATE INDEX idx_schedule_events_project ON schedule_events(project_id);

-- 기존 일정은 다 같이 보던 것이라 공유로 본다.
ALTER TABLE schedule_events ADD COLUMN shared boolean;
UPDATE schedule_events SET shared = true;
ALTER TABLE schedule_events ALTER COLUMN shared SET NOT NULL;
