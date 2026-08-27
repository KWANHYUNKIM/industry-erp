-- 판매·구매 전표에 [과세여부]를 실제로 저장한다.
--
-- 지금까지 과세 여부는 <b>입력할 때 계산에만 쓰이고 전표에 남지 않았다.</b> 그래서 나중에
-- 필요할 때마다 '부가세가 0이면 면세' 로 되짚었다(SalesService·PurchaseService 의
-- recalcAmounts, PriceBulkService 의 부가세유형 표시).
--
-- 그 되짚기가 틀리는 경우가 실제로 있다. 부가세는 반올림하므로 <b>과세인데 부가세가
-- 0 인 전표</b>가 나온다 — 공급가액 4원이면 부가세 0.4원 → 0원이다. 이 전표의 단가를
-- 단가일괄변경으로 100,000원으로 올리면, 면세로 오인해 <b>부가세가 계속 0 으로 남는다.</b>
-- 실측했다: 공급가액 100,000 · 부가세 0. 그 금액으로 세금계산서를 끊으면 부가세를 못 받는다.
--
-- 원본 판매일괄회계반영에 [부가세유형] 열이 있는 것도 같은 이야기다 — 원본은 전표가
-- 그 값을 들고 있다.
--
-- 백필은 지금 쓰던 추론과 같은 규칙을 쓰되, <b>알 수 없는 경우는 과세</b>로 둔다.
--   공급가액이 있는데 부가세가 0  → 면세 (사람이 면세로 넣은 것)
--   그 밖(부가세가 있거나 공급가액이 0) → 과세
-- 공급가액 0 인 전표를 면세로 못박으면 지금 고치는 버그를 그대로 데이터에 새기게 된다.

ALTER TABLE sales ADD COLUMN taxable boolean;
UPDATE sales SET taxable = NOT (vat_amount = 0 AND supply_amount <> 0) WHERE taxable IS NULL;
ALTER TABLE sales ALTER COLUMN taxable SET NOT NULL;

ALTER TABLE purchases ADD COLUMN taxable boolean;
UPDATE purchases SET taxable = NOT (vat_amount = 0 AND supply_amount <> 0) WHERE taxable IS NULL;
ALTER TABLE purchases ALTER COLUMN taxable SET NOT NULL;
