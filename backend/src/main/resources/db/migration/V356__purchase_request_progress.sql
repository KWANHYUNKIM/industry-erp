-- 발주요청조회 [종결여부] · 하단 [진행상태변경] — 원본은 발주요청마다 미확인 / 확인(진행중 · 완료)을 사람이 바꾼다(2026-10-13 E040315 실측).
-- 비어 있으면 예전처럼 발주 흐름(발주확정 · 입고전환이면 완료)으로 정한다.
ALTER TABLE public.purchase_orders ADD COLUMN request_progress varchar(20);
ALTER TABLE public.purchase_orders ADD CONSTRAINT ck_purchase_orders_request_progress
    CHECK (request_progress IN ('UNCONFIRMED', 'IN_PROGRESS', 'COMPLETED'));
