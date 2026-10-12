-- 원본 Invoice/Packing List 는 [Invoice 번호] 를 비워 저장하면 비운 채로 둔다(2026-10-12 실측 — 목록 [Invoice No.] 칸이 빈다).
-- 예전 우리는 INV-yyyyMMdd-nnnn 을 지어 넣었다. 적은 번호끼리만 겹치지 않으면 된다(unique 는 NULL 을 여럿 허용한다).
ALTER TABLE export_orders ALTER COLUMN invoice_no DROP NOT NULL;
