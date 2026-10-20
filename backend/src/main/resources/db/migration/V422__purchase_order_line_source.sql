-- 발주요청 · 발주계획 · 발주서를 다른 전표로 가른다(원본 E040315 2026-10-20 실측 — 앞 전표를 베끼고 줄에 출처 일자 · No. 를 남긴다).
-- 표는 그대로 purchase_orders 하나다: 요청(REQUESTED) · 계획(PLANNED) · 발주서(PRICED → ORDERED → RECEIVED)가 각각 다른 행(= 다른 전표)이고,
-- 다음 전표는 앞 전표의 상태를 바꾸지 않고 줄을 베껴 새 행을 만든다. 베낀 줄이 어디서 왔는지를 여기에 남긴다.
-- 기존 REQUESTED · PLANNED 행은 옮기지 않는다 — 그 행들이 이미 '요청 한 장' · '계획 한 장' 이고, 출처가 없을 뿐이다(원본 메뉴 입력으로 바로 쓴 것과 같다).
ALTER TABLE purchase_order_lines ADD COLUMN source_line_id bigint;
ALTER TABLE purchase_order_lines ADD COLUMN source_order_no varchar(30);
ALTER TABLE purchase_order_lines ADD COLUMN source_order_date date;
-- 원본은 계획이 잇힌 요청을 막지 않고 지운다 — 베낀 줄은 출처 일자 · No. 글자만 남기고 연결은 끊는다.
ALTER TABLE purchase_order_lines ADD CONSTRAINT fk_purchase_order_lines_source_line
    FOREIGN KEY (source_line_id) REFERENCES purchase_order_lines (id) ON DELETE SET NULL;
CREATE INDEX idx_purchase_order_lines_source_line_id ON purchase_order_lines (source_line_id);
