-- 잔액조정입력 '거래처별집계구분' 창의 ☑부서별집계 · ☑프로젝트별집계(원본 1089 외상매출금 '거래처별/부서별/프로젝트별',
-- 2026-10-29 데이터이관 QA 루프 73). 없음/거래처별은 이미 있는 accounts.partner_aggregate 다.
ALTER TABLE accounts ADD COLUMN aggregate_by_dept boolean NOT NULL DEFAULT true;
ALTER TABLE accounts ADD COLUMN aggregate_by_project boolean NOT NULL DEFAULT true;
