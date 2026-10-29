-- 회사정보관리 로고(마크) — 머리 로고 자리 · 브라우저 탭 아이콘. 작은 그림을 바로 든다.
ALTER TABLE company_info ADD COLUMN logo bytea;
ALTER TABLE company_info ADD COLUMN logo_type varchar(50);
ALTER TABLE company_info ADD COLUMN logo_version bigint;
