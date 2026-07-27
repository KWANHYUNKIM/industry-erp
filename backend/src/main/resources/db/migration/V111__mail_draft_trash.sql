-- 메일 임시보관함(초안)·지운함(소프트삭제) 지원.
-- draft: 아직 발송하지 않은 초안(수신함/발신함 제외). deleted_at: 소프트삭제(지운함) 시각.
-- 기존 행은 draft=false(DEFAULT), deleted_at=NULL 이라 기존 동작 그대로.
ALTER TABLE mails ADD COLUMN draft boolean NOT NULL DEFAULT false;
ALTER TABLE mails ADD COLUMN deleted_at timestamp(6);

-- 임시보관함/지운함 조회용 인덱스
CREATE INDEX idx_mails_draft ON mails (sender_id, draft);
CREATE INDEX idx_mails_deleted_at ON mails (deleted_at);
