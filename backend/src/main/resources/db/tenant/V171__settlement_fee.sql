-- 본사 V298 과 같다 — 수금 수수료.
ALTER TABLE settlements ADD COLUMN fee numeric(18,2) NOT NULL DEFAULT 0;
