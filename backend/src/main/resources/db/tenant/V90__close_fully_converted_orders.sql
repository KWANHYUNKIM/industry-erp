-- 판매·구매로 이미 다 끊긴 주문·발주를 닫는다 (QA 9회차).
--
-- 82fe9d3 · 437ed14 부터 주문은 '전 품목 판매' 로, 발주는 '전 품목 구매' 로 닫힌다. 그 규칙은 전표가
-- 바뀔 때마다 적용되므로, 그 전에 이미 다 끊긴 것(개발 DB 기준 주문 121건)은 열린 채 남아 있었다.
-- 판매·구매 라인은 주문·발주 '헤더' 를 가리키므로 품목별로 맞춘다(서비스 코드와 같은 규칙).

-- 1) 주문: 전 품목 판매 → 완료
WITH ordered AS (
    SELECT sales_order_id AS order_id, item_id, SUM(quantity) AS qty
    FROM sales_order_lines GROUP BY sales_order_id, item_id
), sold AS (
    SELECT source_order_id AS order_id, item_id, SUM(quantity) AS qty
    FROM sales_lines WHERE source_order_id IS NOT NULL GROUP BY source_order_id, item_id
)
UPDATE sales_orders o
   SET status = 'COMPLETED'
 WHERE o.status IN ('RECEIVED', 'IN_PROGRESS')
   AND EXISTS (SELECT 1 FROM ordered d WHERE d.order_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM ordered d
                   LEFT JOIN sold s ON s.order_id = d.order_id AND s.item_id = d.item_id
                   WHERE d.order_id = o.id AND COALESCE(s.qty, 0) < d.qty);

-- 2) 발주: 전 품목 구매 → 입고전환. 바뀐 까닭을 이력에 먼저 남긴다(이전 단계가 필요하다).
CREATE TEMP TABLE fully_bought_po ON COMMIT DROP AS
WITH ordered AS (
    SELECT purchase_order_id AS order_id, item_id, SUM(quantity) AS qty
    FROM purchase_order_lines GROUP BY purchase_order_id, item_id
), bought AS (
    SELECT source_order_id AS order_id, item_id, SUM(quantity) AS qty
    FROM purchase_lines WHERE source_order_id IS NOT NULL GROUP BY source_order_id, item_id
)
SELECT po.id, po.status
  FROM purchase_orders po
 WHERE po.status NOT IN ('RECEIVED', 'CANCELLED')
   AND EXISTS (SELECT 1 FROM ordered d WHERE d.order_id = po.id)
   AND NOT EXISTS (SELECT 1 FROM ordered d
                   LEFT JOIN bought b ON b.order_id = d.order_id AND b.item_id = d.item_id
                   WHERE d.order_id = po.id AND COALESCE(b.qty, 0) < d.qty);

INSERT INTO purchase_order_histories (order_id, changed_at, from_status, to_status, changed_by, note)
SELECT id, now(), status, 'RECEIVED', 'system', '구매입력으로 전량 입고(기존 자료 정리)'
  FROM fully_bought_po;

UPDATE purchase_orders po
   SET status = 'RECEIVED'
 WHERE po.id IN (SELECT id FROM fully_bought_po);
