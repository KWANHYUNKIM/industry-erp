-- 영수증으로(원본 회계 I › 현금거래 › 현금예금출금 › 영수증으로 E010402, 2026-10-12 loginaa 실측).
--
-- 원본은 [출금계좌] · [계정] · [거래처명](글자) · [금액] · [수수료] · [적요] 한 장을 저장하고, 회계거래조회에
-- 거래유형 '영수증으로' · 거래처명 'QA회계1-식당'(친 글자 그대로)으로 남는다. 간편전표 종류를 하나 늘리고
-- 머리에 [거래처명](거래처 등록 없이 친 이름)과 [수수료]를 둔다.
alter table fast_vouchers drop constraint ck_fast_vouchers_type;
alter table fast_vouchers add constraint ck_fast_vouchers_type
  check (type in ('EXPENSE_REPORT', 'DEPOSIT_REPORT', 'ADVANCE_SETTLEMENT', 'RECEIPT_PAYMENT'));

alter table fast_vouchers add column payee_name varchar(100);
alter table fast_vouchers add column fee numeric(18,2) not null default 0;
