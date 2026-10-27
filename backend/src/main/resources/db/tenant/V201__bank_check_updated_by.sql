-- 수령수표조회 · 발행수표조회의 [최종수정자] 조건 — 입금 · 부도 · 결제 · 그 취소를 한 사람.
ALTER TABLE bank_checks ADD COLUMN updated_by varchar(50);
UPDATE bank_checks SET updated_by = created_by;
