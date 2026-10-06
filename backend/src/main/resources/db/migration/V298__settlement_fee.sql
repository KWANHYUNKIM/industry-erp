-- 수금 수수료 — 원본 '매출처로부터' [수수료](2026-10-06 loginaa 실측). amount 는 채권이 줄어드는 총액, fee 는 그중 떼인 몫.
ALTER TABLE settlements ADD COLUMN fee numeric(18,2) NOT NULL DEFAULT 0;
