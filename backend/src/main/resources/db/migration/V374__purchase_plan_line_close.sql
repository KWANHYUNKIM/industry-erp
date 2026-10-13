-- 발주계획조회(C000076) — 원본은 계획을 <줄마다> 종결한다(2026-10-13 loginaa 실측: [종결여부] '종결' 을 누르면 그 품목 줄만
-- 완료 탭으로 가고, 완료 탭에서 주황 '취소' 로 되돌린다). 목록 [최종수정자] 칸도 원본에 있다 — 고친 사람을 남긴다.
ALTER TABLE public.purchase_order_lines ADD COLUMN plan_closed boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_orders ADD COLUMN updated_by varchar(50);
UPDATE public.purchase_orders SET updated_by = created_by WHERE updated_by IS NULL;
