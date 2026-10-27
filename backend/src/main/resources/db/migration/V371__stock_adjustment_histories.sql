-- 재고 I > 기타이동 > 재고조정조회 (원본 E040614) [이력조회 ▴] 간편조정 이력조회 · 단계별조정 이력조회 (2026-10-13 loginaa 실측):
--   작업일자 · 전표번호 · 행위(신규 · 삭제) · 거래처코드 · 거래처명 · 품목명 · 담당자코드 · 담당자명 · 작업자 · 전표상태 · 이력.
--   지운 전표도 '삭제' 줄로 남는다 — 그래서 조정 행과 따로 적는다(조정 행을 지워도 이력은 남는다, FK 없음).
CREATE TABLE stock_adjustment_histories (
    id bigserial PRIMARY KEY,
    adjust_no varchar(30) NOT NULL,
    adjust_date date NOT NULL,
    sort varchar(10) NOT NULL,
    action varchar(10) NOT NULL,
    item_label varchar(300),
    partner_id bigint,
    employee_id bigint,
    worker varchar(50),
    worked_at timestamp NOT NULL
);
CREATE INDEX idx_stock_adjustment_histories_worked_at ON stock_adjustment_histories (worked_at);
