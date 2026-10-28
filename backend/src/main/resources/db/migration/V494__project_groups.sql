-- 프로젝트등록 [프로젝트정보] 탭의 프로젝트그룹1 · 2 (원본: 글자 칸으로 둔다 — 그룹 마스터 미실측)
ALTER TABLE projects ADD COLUMN group1 varchar(50);
ALTER TABLE projects ADD COLUMN group2 varchar(50);
