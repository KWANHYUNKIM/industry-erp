-- 관리 > 사원등록 [급여통장](은행 · 계좌번호 · 예금주) — 급여이체현황(E090117)이 이것으로 이체 목록을 만든다.
ALTER TABLE employees ADD COLUMN bank_code varchar(10);
ALTER TABLE employees ADD COLUMN bank_name varchar(50);
ALTER TABLE employees ADD COLUMN account_no varchar(50);
ALTER TABLE employees ADD COLUMN account_holder varchar(50);
