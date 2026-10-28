-- 전표 줄이 입력 시점의 품목명을 따로 저장한다(원본 줄 품목명은 입력 시점 이름 — 0005 구매 줄 '포장김치1kg').
-- 기존 줄은 지금 품목 이름으로 채운다. FK 아님.
ALTER TABLE sales_lines ADD COLUMN item_name varchar(200);
ALTER TABLE purchase_lines ADD COLUMN item_name varchar(200);
ALTER TABLE quotation_lines ADD COLUMN item_name varchar(200);
ALTER TABLE sales_order_lines ADD COLUMN item_name varchar(200);
ALTER TABLE shipment_order_lines ADD COLUMN item_name varchar(200);
ALTER TABLE shipment_lines ADD COLUMN item_name varchar(200);
ALTER TABLE purchase_order_lines ADD COLUMN item_name varchar(200);
UPDATE sales_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
UPDATE purchase_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
UPDATE quotation_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
UPDATE sales_order_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
UPDATE shipment_order_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
UPDATE shipment_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
UPDATE purchase_order_lines l SET item_name = i.name FROM items i WHERE i.id = l.item_id;
