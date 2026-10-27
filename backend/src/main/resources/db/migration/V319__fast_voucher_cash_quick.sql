-- 현금거래 한 장짜리 입력 열한 개(원본 회계 I › 현금거래, 2026-10-12 loginaa 실측):
--   입금 — 매출처로부터 E010404 · 카드매출대금회수 E010405 · 일시적으로(입금) E010401 · 은행차입으로 E010406 · 기타입금 E010407
--   출금 — 매입처로 E010409 · 법인카드대금결제 E010412 · 계좌간이동 E010411 · 일시적으로(출금) E010410 · 은행으로 E010413 · 기타출금 E010414
-- 영수증으로(V310)처럼 간편전표 종류를 늘리고, 머리에 상대 계좌(계좌간이동 출금계좌 · 차입처) · 법인카드 · 카드사 · 사원 · 수수료율을 둔다.
alter table fast_vouchers drop constraint ck_fast_vouchers_type;
alter table fast_vouchers add constraint ck_fast_vouchers_type
  check (type in ('EXPENSE_REPORT', 'DEPOSIT_REPORT', 'ADVANCE_SETTLEMENT', 'RECEIPT_PAYMENT',
                  'SALES_COLLECTION', 'CARD_SALES_COLLECTION', 'TEMP_DEPOSIT', 'BANK_BORROWING', 'OTHER_DEPOSIT',
                  'PURCHASE_PAYMENT', 'CARD_BILL_PAYMENT', 'ACCOUNT_TRANSFER', 'TEMP_WITHDRAW', 'LOAN_REPAYMENT',
                  'OTHER_WITHDRAW'));

alter table fast_vouchers add column counter_bank_account_id bigint references bank_accounts(id);
alter table fast_vouchers add column credit_card_id bigint references credit_cards(id);
alter table fast_vouchers add column card_issuer_id bigint references card_issuers(id);
alter table fast_vouchers add column employee_id bigint;
alter table fast_vouchers add column fee_rate numeric(7,3);

create index idx_fast_vouchers_counter_bank_account_id on fast_vouchers (counter_bank_account_id);
create index idx_fast_vouchers_credit_card_id on fast_vouchers (credit_card_id);
create index idx_fast_vouchers_card_issuer_id on fast_vouchers (card_issuer_id);
