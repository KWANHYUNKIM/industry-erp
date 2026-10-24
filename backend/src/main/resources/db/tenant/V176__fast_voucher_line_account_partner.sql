-- 지출결의서 · 입금보고서(원본 회계 I › 현금거래 › 지출결의서 E010408 · 입금보고서 E010403, 2026-10-12 loginaa 실측).
--
-- 원본은 격자 한 줄마다 [돈 나간(들어온) 계좌] · [계정코드] · [거래처] · [금액] · [적요]를 따로 넣는다 —
-- 한 장 안에서 줄마다 현금 · 다른 통장을 섞어 쓸 수 있다. 우리는 결제수단 · 계좌 · 거래처를 전표 머리에 하나만 들었다.
-- 줄에 [계좌](비우면 현금)와 [거래처]를 더한다. 옛 줄은 머리 값을 그대로 따르므로 비워 둔다.
alter table fast_voucher_lines add column bank_account_id bigint;
alter table fast_voucher_lines add constraint fk_fast_voucher_lines_bank_account
  foreign key (bank_account_id) references bank_accounts (id);
create index idx_fast_voucher_lines_bank_account on fast_voucher_lines (bank_account_id);

alter table fast_voucher_lines add column partner_id bigint;
alter table fast_voucher_lines add constraint fk_fast_voucher_lines_partner
  foreign key (partner_id) references business_partners (id);
create index idx_fast_voucher_lines_partner on fast_voucher_lines (partner_id);

-- 줄마다 현금인지 계좌인지 정했는지. false 면 옛 줄 — 머리 결제수단을 따른다.
alter table fast_voucher_lines add column own_settlement boolean not null default false;
