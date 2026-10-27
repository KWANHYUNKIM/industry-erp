-- 단계별재고실사(E040650) 실사 전표 — 원본은 실사 한 장(일자 · 창고 · 여러 줄)을 저장하고, 아래 [재고조정] 체크가 켜져 있으면
-- 그 일자의 재고조정까지 만든다(2026-10-21 loginaa 실측: 포장김치 제2창고 311 → 실사 7 → 재고조정조회 '단계별 · 26/10/20-1 · 304').
-- slip_no 는 전표 번호(줄들이 같이 쓴다), adjustment_id 는 이 줄로 맞춘 재고조정 — 조정을 지우면 비운다.
ALTER TABLE staged_stock_adjustments ADD COLUMN slip_no varchar(30);
UPDATE staged_stock_adjustments SET slip_no = adjust_no WHERE slip_no IS NULL;
ALTER TABLE staged_stock_adjustments ALTER COLUMN slip_no SET NOT NULL;
ALTER TABLE staged_stock_adjustments ADD COLUMN adjustment_id bigint
    REFERENCES stock_adjustments (id) ON DELETE SET NULL;
CREATE INDEX idx_staged_stock_adjustments_slip_no ON staged_stock_adjustments (slip_no);
CREATE INDEX idx_staged_stock_adjustments_adjustment_id ON staged_stock_adjustments (adjustment_id);
