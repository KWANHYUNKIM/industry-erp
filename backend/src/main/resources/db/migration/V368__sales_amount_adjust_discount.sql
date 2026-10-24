-- 재고 I > 영업관리 > 판매 > 판매입력 II (원본 E040253, 2026-10-13 loginaa 실측) [금액조정] 의 '할인 감소(-)'.
--   QA재고1-볼트 10 × 1,000 (공급 10,000 · 부가세 1,000) 에 할인 합계 1,100 → 공급 1,000 · 부가세 100 으로 나뉘고
--   전표 금액합계 9,900, 매출전표 차) 외상매출금 9,900 / 대) 제품매출 9,000 · 부가세예수금 900.
--   전표 머리 금액(supply/vat/total)은 할인을 뺀 값이고, 뺀 할인은 여기에 따로 남긴다(줄 합계 − 할인 = 머리).
ALTER TABLE sales
    ADD COLUMN discount_supply numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN discount_vat numeric(18,2) NOT NULL DEFAULT 0;
