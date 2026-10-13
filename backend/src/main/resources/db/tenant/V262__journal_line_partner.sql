-- 일반전표(E010201) 줄별 [거래처] · 머리 [첨언내용] — 원본 격자는 줄마다 거래처코드 · 거래처명을 받는다(2026-10-13 loginaa).
ALTER TABLE journal_lines ADD COLUMN partner_id bigint;
ALTER TABLE journal_lines ADD CONSTRAINT fk_journal_lines_partner FOREIGN KEY (partner_id) REFERENCES business_partners (id);
CREATE INDEX idx_journal_lines_partner_id ON journal_lines (partner_id);

ALTER TABLE journal_entries ADD COLUMN memo varchar(1000);
