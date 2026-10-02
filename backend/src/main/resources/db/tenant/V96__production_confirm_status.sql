-- 생산입고의 <b>진행상태</b> — 원본 생산입고조회 탭 [전체 · 결재중 · 미확인 · 확인] 과 [진행상태변경].
-- 판매(V16)와 같은 값·규칙: 확인한 전표는 확인취소를 먼저 해야 고치거나 지울 수 있다. 전표(같은 prod_no)째 바뀐다.

ALTER TABLE productions ADD COLUMN confirm_status varchar(20) NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE productions ADD CONSTRAINT ck_productions_confirm_status
    CHECK (confirm_status IN ('UNCONFIRMED', 'IN_APPROVAL', 'CONFIRMED'));
