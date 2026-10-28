-- 출하지시서입력 [판매] 불러오기(원본 E040220 '판매검색창', 2026-10-28 데이터이관 루프 27 실측) — 원본 흐름은 판매 → 출하지시서 → 출하.
-- 출하지시서 줄이 어느 판매에서 왔는지 든다. 판매검색창은 아직 출하지시서가 안 걸린 판매만 보인다.
-- 판매 머리를 가리킨다(판매 줄은 수정할 때 다시 만들어져 줄 id 가 바뀐다). 판매를 지우면 연결만 비운다.
ALTER TABLE shipment_order_lines ADD COLUMN sales_id bigint;
ALTER TABLE shipment_order_lines ADD CONSTRAINT fk_shipment_order_lines_sales_id
    FOREIGN KEY (sales_id) REFERENCES sales (id) ON DELETE SET NULL;
CREATE INDEX idx_shipment_order_lines_sales_id ON shipment_order_lines (sales_id);
