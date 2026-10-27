-- 회계 I › 비현금거래(2026-10-13 loginaa 실측) — 일반영수증 · 신용카드전표 · 기타를 간편전표 종류로 더한다(돈이 오가지 않는 한 장 입력).
alter table fast_vouchers drop constraint ck_fast_vouchers_type;
alter table fast_vouchers add constraint ck_fast_vouchers_type
  check (type in ('EXPENSE_REPORT', 'DEPOSIT_REPORT', 'ADVANCE_SETTLEMENT', 'RECEIPT_PAYMENT',
                  'SALES_COLLECTION', 'CARD_SALES_COLLECTION', 'TEMP_DEPOSIT', 'BANK_BORROWING', 'OTHER_DEPOSIT',
                  'PURCHASE_PAYMENT', 'CARD_BILL_PAYMENT', 'ACCOUNT_TRANSFER', 'TEMP_WITHDRAW', 'LOAN_REPAYMENT',
                  'OTHER_WITHDRAW', 'RECEIPT_ONLY', 'CARD_SLIP', 'NONCASH_OTHER'));
