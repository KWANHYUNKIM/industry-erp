-- 회계 I > 기초등록 > 카드등록(E010103 카드리스트) · 계좌등록(E010104 계좌리스트) — 2026-10-13 loginaa 실측.
--
-- 카드 신규 창 '신용카드등록': 카드코드 · 카드명 · 카드구분(신용카드/체크카드) · 결제계좌 · 사업용 카드 구분(Y/N, 기본 N)
--   · 계정(필수 — 카드를 쓰면 이 계정으로 대변이 잡힌다, 기본은 미지급금) · 카드관리자 · 검색창내용 · 적요.
-- 계좌 신규 창 '통장계좌등록': 계좌코드 · 계좌명 · 계정 · 검색창내용 · 적요 · 외화계좌,
--   줄의 [이체정보] 창: 은행명 · 계좌번호 · 예금주명 · 적요1 · 적요2.
alter table credit_cards add column card_kind varchar(10) not null default 'CREDIT';
alter table credit_cards add constraint ck_credit_cards_card_kind check (card_kind in ('CREDIT', 'CHECK'));
alter table credit_cards add column business_use boolean not null default false;
alter table credit_cards add column gl_account_id bigint;
alter table credit_cards add constraint fk_credit_cards_gl_account_id foreign key (gl_account_id) references accounts(id);
create index idx_credit_cards_gl_account_id on credit_cards (gl_account_id);
alter table credit_cards add column manager varchar(50);
alter table credit_cards add column search_text varchar(100);

alter table bank_accounts add column search_text varchar(100);
alter table bank_accounts add column transfer_remark1 varchar(100);
alter table bank_accounts add column transfer_remark2 varchar(100);
