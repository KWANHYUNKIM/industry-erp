-- 받을어음거래처지급(E010603) — 받아 둔 어음을 거래처에 넘겨(배서) 외상매입금을 갚는다(2026-10-20 loginaa 실측).
-- 전표 차) 외상매입금(받는 거래처) / 대) 받을어음(어음 거래처). 받을어음조회 거래유형 '받을어음거래처지급'.

ALTER TABLE promissory_notes DROP CONSTRAINT ck_promissory_notes_status;
ALTER TABLE promissory_notes ADD CONSTRAINT ck_promissory_notes_status
    CHECK (status IN ('HELD', 'SETTLED', 'DISCOUNTED', 'DISHONORED', 'RECORD_DECREASED', 'ENDORSED'));

ALTER TABLE promissory_notes ADD COLUMN close_partner_id bigint REFERENCES business_partners(id);
CREATE INDEX idx_promissory_notes_close_partner_id ON promissory_notes (close_partner_id);
