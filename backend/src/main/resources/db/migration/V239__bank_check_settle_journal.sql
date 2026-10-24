-- 받은수표가 손을 떠날 때(입금 · 부도) 만든 회계전표를 수표가 가리킨다.
--
-- 원본 수령수표감소현황(E060610)의 첫 열은 [일자-No.] — 그 감소를 적은 회계전표 번호다. 입금 · 부도 분개는
-- source_id 없이 만들어져 수표에서 거꾸로 찾을 길이 없었다(받을 때의 분개만 source_id 로 잇는다).
-- 이제 그 전표 id 를 수표에 남긴다. 발행수표의 결제는 분개를 안 만들므로(발행 때 이미 반영) 비어 있다.

ALTER TABLE bank_checks ADD COLUMN settle_journal_id bigint;
ALTER TABLE bank_checks ADD CONSTRAINT fk_bank_checks_settle_journal
    FOREIGN KEY (settle_journal_id) REFERENCES journal_entries (id);
CREATE INDEX idx_bank_checks_settle_journal ON bank_checks (settle_journal_id);
