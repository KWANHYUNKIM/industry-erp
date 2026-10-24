-- 회계 II › 비용관리 비용내역(원본 E060812 비용내역입력 · E060813 조회 · E060815 현황) — 원본 비용 전표는
-- 작성일자(기준일자)와 줄의 [사용일자]를 따로 두고, 머리에 [결제구분](개인비용 · 회사비용)과 [비고]가 있다.
-- 우리 비용 전표에는 날짜 하나 · 적요뿐이라 조회 · 현황의 [사용일자] · [비고] · [결제구분] 조건이 걸 데가 없었다.
-- 사용일자가 비면 기준일자와 같은 날로 본다(예전 전표).
ALTER TABLE expenses ADD COLUMN use_date date;
ALTER TABLE expenses ADD COLUMN remarks varchar(200);
ALTER TABLE expenses ADD COLUMN pay_type varchar(10);
ALTER TABLE expenses ADD CONSTRAINT ck_expenses_pay_type CHECK (pay_type IN ('PERSONAL', 'COMPANY'));
