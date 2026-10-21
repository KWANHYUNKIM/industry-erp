-- 근태(vacation_requests)를 사원 기준으로 — 원본 근태입력(E020710)은 로그인 계정이 아니라 사원(사원번호 · 사원명 · 부서)에 근태를 단다.
-- 기존 자료는 계정 ↔ 사원 연결(users.employee_id)로 백필하고, 계정이 없는 사원도 근태를 넣을 수 있게 user_id 는 비워도 되게 둔다
-- (전자결재 휴가신청서처럼 계정에서 들어오는 근태는 계정도 함께 남는다).
ALTER TABLE vacation_requests ADD COLUMN employee_id bigint;
UPDATE vacation_requests v SET employee_id = u.employee_id
  FROM users u
 WHERE u.id = v.user_id AND u.employee_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM employees e WHERE e.id = u.employee_id);
ALTER TABLE vacation_requests ADD CONSTRAINT fk_vacation_requests_employee FOREIGN KEY (employee_id) REFERENCES employees (id);
CREATE INDEX idx_vacation_requests_employee_id ON vacation_requests (employee_id);
ALTER TABLE vacation_requests ALTER COLUMN user_id DROP NOT NULL;
