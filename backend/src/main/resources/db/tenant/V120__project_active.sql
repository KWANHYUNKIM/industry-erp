-- 관리 > 프로젝트등록(E010112): 원본 프로젝트리스트의 [사용] — 사용중단/재사용.
ALTER TABLE projects ADD COLUMN active boolean NOT NULL DEFAULT true;
