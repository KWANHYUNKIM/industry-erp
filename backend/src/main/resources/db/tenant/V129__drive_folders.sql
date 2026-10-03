-- ECDrive 폴더(원본 E077100, 2026-10-03 실측).
--
-- 원본은 My Drive · Shared Drive 를 우클릭해 [새 폴더]를 만들고, 폴더는 왼쪽 나무와 목록에 함께 선다.
-- 우리 드라이브는 파일만 있었다. 폴더도 같은 표의 한 줄로 두고(is_folder), 파일 · 폴더가 어느 폴더 안에
-- 있는지는 parent_id 로 잇는다. 최상위면 null.
ALTER TABLE drive_documents ADD COLUMN is_folder boolean NOT NULL DEFAULT false;
ALTER TABLE drive_documents ADD COLUMN parent_id bigint REFERENCES drive_documents (id);
CREATE INDEX idx_drive_documents_parent_id ON drive_documents (parent_id);
