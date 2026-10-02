-- 생산불출 · 작업지시서의 <b>진행상태</b> — 원본 생산불출조회 · 작업지시서조회 탭 [전체 · 결재중 · 미확인 · 확인].
-- 생산입고(V223)와 같은 세 값·규칙: 확인한 전표는 확인취소를 먼저 해야 고치거나 지울 수 있다. 전표(같은 번호)째 바뀐다.

ALTER TABLE material_issues ADD COLUMN confirm_status varchar(20) NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE material_issues ADD CONSTRAINT ck_material_issues_confirm_status
    CHECK (confirm_status IN ('UNCONFIRMED', 'IN_APPROVAL', 'CONFIRMED'));

ALTER TABLE work_orders ADD COLUMN confirm_status varchar(20) NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE work_orders ADD CONSTRAINT ck_work_orders_confirm_status
    CHECK (confirm_status IN ('UNCONFIRMED', 'IN_APPROVAL', 'CONFIRMED'));
