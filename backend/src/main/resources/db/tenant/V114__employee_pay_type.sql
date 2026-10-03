-- (테넌트) 관리 > 사원등록(E090101): 사원리스트의 [급여구분] 열·조건과 폼의 [모바일]·[퇴사사유]·[주소].
-- 급여구분은 원본처럼 새 사원이 고정급으로 시작하므로 기존 행도 고정급으로 채운다.
ALTER TABLE employees ADD COLUMN pay_type varchar(10) NOT NULL DEFAULT 'FIXED';
ALTER TABLE employees ADD CONSTRAINT employees_pay_type_check CHECK (pay_type IN ('FIXED', 'VARIABLE'));
ALTER TABLE employees ADD COLUMN mobile varchar(30);
ALTER TABLE employees ADD COLUMN resign_reason varchar(100);
ALTER TABLE employees ADD COLUMN address varchar(200);
