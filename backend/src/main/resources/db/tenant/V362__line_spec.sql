-- 전표 줄 규격을 줄마다 따로 저장한다(원본 이카운트: 품목을 고르면 품목 규격으로 채우되 줄에서 고치거나 비울 수 있다).
-- 기존 줄은 지금 화면 모양을 지키도록 품목 규격으로 채운다. FK 아님.
ALTER TABLE sales_lines ADD COLUMN spec varchar(200);
ALTER TABLE purchase_lines ADD COLUMN spec varchar(200);
ALTER TABLE quotation_lines ADD COLUMN spec varchar(200);
ALTER TABLE sales_order_lines ADD COLUMN spec varchar(200);
UPDATE sales_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
UPDATE purchase_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
UPDATE quotation_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
UPDATE sales_order_lines l SET spec = i.spec FROM items i WHERE i.id = l.item_id;
