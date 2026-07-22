-- 기타이동 유형에 대체사용(SUBSTITUTE)·폐기(DISPOSAL) 추가.
-- V25의 CHECK 제약이 옛 3종만 허용해 새 유형 저장이 막히므로 제약을 교체한다.
-- (StockAdjustmentType enum 확장과 같은 커밋. 이카운트 E040510 대체사용현황·E040511 폐기현황 대응.)
ALTER TABLE stock_adjustments DROP CONSTRAINT ck_stock_adjustments_type;
ALTER TABLE stock_adjustments ADD CONSTRAINT ck_stock_adjustments_type
    CHECK (type IN ('SELF_USE', 'DEFECT', 'SUBSTITUTE', 'DISPOSAL', 'ADJUST'));
