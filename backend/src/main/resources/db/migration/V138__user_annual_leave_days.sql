-- 휴가 부여일수를 사람마다 따로 둔다.
--
-- 예전에는 HrService 의 상수(DEFAULT_ANNUAL_DAYS = 15)를 전원에게 똑같이 썼다.
-- 근속연수에 따라 연차가 다른데(근로기준법 15일 시작, 3년차부터 2년마다 +1일, 최대 25일)
-- 휴가잔여일수현황은 모두를 15일로 보여줬다.
--
-- 소수 3자리인 이유: 시간 단위 휴가가 0.125일(1시간)·0.13 같은 값으로 쌓인다.
ALTER TABLE users ADD COLUMN annual_leave_days numeric(6,3);
UPDATE users SET annual_leave_days = 15 WHERE annual_leave_days IS NULL;
ALTER TABLE users ALTER COLUMN annual_leave_days SET NOT NULL;
ALTER TABLE users ALTER COLUMN annual_leave_days SET DEFAULT 15;
