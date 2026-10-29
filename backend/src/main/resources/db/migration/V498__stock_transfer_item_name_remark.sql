-- 창고이동 줄 품목명 · 머리 적요 — 원본 창고이동입력은 품목을 고른 뒤 이름 칸을 고쳐 쓰고('포장김치1kg'),
-- 머리 끝에 [새로운 항목 추가](적요)가 있다(2026-10-29 데이터이관 QA). 판매 · 구매 줄 item_name 과 같은 꼴.
-- 옛 줄의 item_name 은 비워 둔다(null = 품목 이름으로 본다). remark 는 전표 머리라 줄마다 같은 값을 든다.
ALTER TABLE stock_transfers ADD COLUMN item_name varchar(200);
ALTER TABLE stock_transfers ADD COLUMN remark varchar(500);
