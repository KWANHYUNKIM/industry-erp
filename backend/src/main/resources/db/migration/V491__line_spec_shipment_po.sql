-- 출하지시서 · 출하 · 발주서 줄도 규격을 줄마다 따로 저장한다(V490 과 같은 꼴). 기존 줄은 지금 화면 모양을 지키도록 품목 규격으로 채운다. FK 아님.
ALTER TABLE shipment_order_lines ADD COLUMN spec varchar(200);
ALTER TABLE shipment_lines ADD COLUMN spec varchar(200);
ALTER TABLE purchase_order_lines ADD COLUMN spec varchar(200);
UPDATE shipment_order_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
UPDATE shipment_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
UPDATE purchase_order_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
