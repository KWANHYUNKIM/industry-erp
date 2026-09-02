-- 파일에 <b>어느 화면 것인지</b>를 적어 둔다.
--
-- 권한이 하나도 없는 계정으로 GET /api/files/{id} 를 부르면 남이 올린 증빙이 그대로
-- 내려받혔다. 지우는 것은 '올린 사람' 으로 막았지만(#210) 읽기는 그걸로 막을 수 없다 —
-- 증빙은 회계 담당자가 올리고 결재자가 보는 것이 정상이라, 올린 사람으로 막으면
-- 멀쩡한 화면이 깨진다. 막으려면 그 파일이 어느 화면 것인지 알아야 하는데
-- 파일 자체가 그걸 몰랐다. 그 칸을 만든다.
--
-- 값은 메뉴 권한 코드다(MenuPermissionCatalog). 비어 있으면 지금까지처럼 누구나 읽는다 —
-- 그래야 아직 주인을 안 적은 파일 때문에 화면이 조용히 깨지지 않는다.

ALTER TABLE stored_files ADD COLUMN owner_code varchar(40);
CREATE INDEX idx_stored_files_owner_code ON stored_files (owner_code);

-- 이미 붙어 있는 파일은 붙은 곳을 보고 주인을 적는다. 지어내는 것이 아니라
-- 실제로 그 표가 물고 있는 파일만 고른다.
UPDATE stored_files SET owner_code = 'ACCOUNTING'
 WHERE owner_code IS NULL
   AND id IN (SELECT file_id FROM evidence_attachments WHERE file_id IS NOT NULL);
UPDATE stored_files SET owner_code = 'TAX'
 WHERE owner_code IS NULL
   AND id IN (SELECT file_id FROM medical_device_reports WHERE file_id IS NOT NULL);
UPDATE stored_files SET owner_code = 'GROUPWARE'
 WHERE owner_code IS NULL
   AND (id IN (SELECT attachment_id FROM approval_documents WHERE attachment_id IS NOT NULL)
     OR id IN (SELECT file_id FROM drive_documents WHERE file_id IS NOT NULL)
     OR id IN (SELECT attachment_id FROM surveys WHERE attachment_id IS NOT NULL));
UPDATE stored_files SET owner_code = 'PRODUCTION'
 WHERE owner_code IS NULL
   AND id IN (SELECT attachment_id FROM work_posts WHERE attachment_id IS NOT NULL);
UPDATE stored_files SET owner_code = 'INV_MASTER'
 WHERE owner_code IS NULL
   AND id IN (SELECT image_file_id FROM items WHERE image_file_id IS NOT NULL);
