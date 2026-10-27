-- 가지급금정산서(회계 I › FastEntry, 원본 E010505) 격자의 [정산자] — 줄마다 사원을 고른다.
-- 사원은 hr 모듈이라 FK 없이 id 와 그때 이름만 든다(CLAUDE.md 4.1: accounting → hr 새 간선 금지).
ALTER TABLE fast_voucher_lines ADD COLUMN employee_id bigint;
ALTER TABLE fast_voucher_lines ADD COLUMN employee_name varchar(100);
