-- 단계별 실사의 재고조정을 지운 줄을 조정 전(요청)으로 되돌린다.
-- c3b077df 이전에는 재고조정을 지우면 ON DELETE SET NULL 이 adjustment_id 만 비워 'APPLIED · 조정 없음' 으로 남았다
-- (회사 0005 ST-20261010-0001-1). 원본은 그 실사를 조정 전으로 돌린다(2026-10-28 loginaa 실측) — 지금 삭제 코드
-- (StockAdjustmentService.unlinkStaged)와 같게 status REQUESTED · handler NULL · adjustment_id NULL.
-- 옛 방식(조정 연결 칸이 생기기 전)으로 반영한 줄은 적요 '단계별조정 {실사번호}[ (사유)]' 의 조정이 아직 있으므로 건드리지 않는다.
UPDATE staged_stock_adjustments s
   SET status = 'REQUESTED', handler = NULL, adjustment_id = NULL
 WHERE s.status = 'APPLIED'
   AND s.adjustment_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM stock_adjustments a
                    WHERE a.reason = '단계별조정 ' || s.adjust_no
                       OR a.reason LIKE '단계별조정 ' || s.adjust_no || ' (%');
