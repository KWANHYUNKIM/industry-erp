-- 지출(비용)의 부가세(매입세액) — QA 46회차
--
-- 세금계산서를 받은 비용(예: 공급가 100,000 + 부가세 10,000)은 부가세를 부가세대급금(135)으로 갈라야
-- 매입세액 공제를 받는다. 지출에 부가세 칸이 없어 110,000 전부가 비용으로 잡혔다.
-- amount 는 지금처럼 비용(공급가액), vat_amount 를 따로 두고 낸 돈 = amount + vat_amount.
-- 기존 행은 부가세 0 — 지금까지의 뜻(전액 비용) 그대로다.
ALTER TABLE expenses ADD COLUMN vat_amount numeric(18,2) NOT NULL DEFAULT 0;
