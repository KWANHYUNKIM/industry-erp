-- 받을어음감소(E010602) 한 장 전표 — 원본은 감소 하나가 회계전표 하나다(차) 입금계좌 금액 · 이자비용 수수료 / 대) 받을어음 총금액).
-- 감소를 지우면 그 전표도 지운다. 어음 줄이 그 전표를 가리킨다.
ALTER TABLE promissory_notes ADD COLUMN close_journal_entry_id bigint;
ALTER TABLE promissory_notes ADD CONSTRAINT fk_promissory_notes_close_journal_entry
    FOREIGN KEY (close_journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL;
CREATE INDEX idx_promissory_notes_close_journal_entry_id ON promissory_notes (close_journal_entry_id);
