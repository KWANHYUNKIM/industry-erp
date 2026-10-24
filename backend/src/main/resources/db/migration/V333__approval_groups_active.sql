-- 원본 '구분검색' [수정] 모드 › 구분검색수정 [사용중단/재사용 ▲] 사용중단 · 삭제(2026-10-13 loginaa E070107 실측).
ALTER TABLE approval_groups ADD COLUMN active boolean;
UPDATE approval_groups SET active = true WHERE active IS NULL;
ALTER TABLE approval_groups ALTER COLUMN active SET NOT NULL;
ALTER TABLE approval_groups ALTER COLUMN active SET DEFAULT true;
