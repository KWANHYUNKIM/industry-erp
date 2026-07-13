-- V16: 판매전표 확인상태 (이카운트 판매조회의 탭 '전체 / 결재중 / 미확인 / 확인')
--
-- 원본 판매조회에는 '전자결재', '진행상태변경', '확인취소' 버튼이 있다.
-- 판매전표를 기안서에 걸어 상신하면 결재중이 되고, 결재가 끝나면 확인 상태가 된다.
-- 이 연결은 V13 의 approval_document_vouchers 가 이미 받쳐준다.
--
-- confirm_status 는 값으로 분기하는 상태값이라 코드 마스터가 아니라 enum 으로 둔다.
--   UNCONFIRMED 미확인 / IN_APPROVAL 결재중 / CONFIRMED 확인

ALTER TABLE public.sales ADD COLUMN confirm_status character varying(20) NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE public.sales ADD COLUMN confirmed_at timestamp(6) without time zone;

ALTER TABLE public.sales ADD CONSTRAINT ck_sales_confirm_status
    CHECK (confirm_status IN ('UNCONFIRMED', 'IN_APPROVAL', 'CONFIRMED'));

-- 탭 전환마다 상태로 거르므로 인덱스를 둔다.
CREATE INDEX idx_sales_confirm_status ON public.sales (confirm_status);
