-- production_plans.work_order_no 제거.
--
-- 이 컬럼은 작업지시를 '주문번호 문자열'로만 들고 있던 옛 모델의 잔재다.
-- 2026-07-10 에 ProductionPlan.workOrder(@ManyToOne → work_order_id)로 대체했고
-- 엔티티에서도 필드를 삭제했다. V1 베이스라인은 그 이전에 드리프트된 스키마를
-- pg_dump 로 뜬 것이라 죽은 컬럼이 그대로 들어가 있다.
--
-- 아직 초기화하지 않은 DB가 있을 수 있으므로, 떨구기 전에 남아 있는 문자열을
-- 실제 FK 로 한 번 더 백필한다(이미 채워진 행은 건드리지 않는다).

UPDATE production_plans p
   SET work_order_id = wo.id
  FROM work_orders wo
 WHERE p.work_order_id IS NULL
   AND p.work_order_no IS NOT NULL
   AND p.work_order_no = wo.order_no;

ALTER TABLE production_plans DROP COLUMN IF EXISTS work_order_no;
