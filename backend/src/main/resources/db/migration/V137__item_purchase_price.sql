-- 품목에 구매단가를 둔다.
--
-- 지금까지 품목 단가가 unit_price 하나뿐이라, 구매할인현황이 판매 기준단가와 매입가를
-- 견주고 있었다. 매입가가 판매가보다 높은 것이 이상할 이유가 없으므로 개발 자료 488줄이
-- 전부 '할증' 으로 찍혔다 — 화면 이름은 할인현황인데 할인이 0건이었다.
-- 원본 이카운트 품목등록도 판매단가와 구매단가를 따로 둔다.
--
-- 기존 행은 0 으로 채운다. 0 은 "구매 기준단가를 안 정했다" 는 뜻이고,
-- 구매할인현황은 그런 줄의 할인액을 0 으로 둔다(없는 기준으로 계산하지 않는다).
ALTER TABLE items ADD COLUMN purchase_price numeric(15,2);
UPDATE items SET purchase_price = 0 WHERE purchase_price IS NULL;
ALTER TABLE items ALTER COLUMN purchase_price SET NOT NULL;
ALTER TABLE items ALTER COLUMN purchase_price SET DEFAULT 0;
