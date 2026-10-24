-- 주문에서 만든 출하가 주문의 프로젝트·창고를 이어받지 않던 것을 메운다.
--
-- ShipmentService.createFromOrder 가 "주문서에 프로젝트 칸이 없어 이어받을 것이 없다" 는 옛 주석대로
-- 프로젝트를 비워 두었다. 그 뒤 주문서에 프로젝트·창고 칸이 생겼는데 여기만 그대로라, 주문에서 만든
-- 출하는 늘 프로젝트 없이 나갔고 출하조회·프로젝트별 손익에서 빠졌다(2026-10-01 발견).
-- 코드는 고쳤고, 이미 만들어진 출하는 그 주문의 값으로 채운다. 출하에 직접 넣은 값은 건드리지 않는다.
UPDATE shipments s
   SET project_id = o.project_id
  FROM sales_orders o
 WHERE s.sales_order_id = o.id
   AND s.project_id IS NULL
   AND o.project_id IS NOT NULL;

UPDATE shipments s
   SET warehouse_id = o.warehouse_id
  FROM sales_orders o
 WHERE s.sales_order_id = o.id
   AND s.warehouse_id IS NULL
   AND o.warehouse_id IS NOT NULL;
