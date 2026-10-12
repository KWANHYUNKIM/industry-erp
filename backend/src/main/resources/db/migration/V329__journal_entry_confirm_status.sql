-- 회계거래조회의 진행상태 — 원본 탭 [전체 · 결재중 · 미확인 · 확인] 과 [확인] · [확인취소] 단추.
-- 판매 · 생산(V16 · V223 · V225)과 같은 세 값. 결재중은 전자결재가 정한다.

ALTER TABLE journal_entries ADD COLUMN confirm_status varchar(20) NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_confirm_status
    CHECK (confirm_status IN ('UNCONFIRMED', 'IN_APPROVAL', 'CONFIRMED'));
