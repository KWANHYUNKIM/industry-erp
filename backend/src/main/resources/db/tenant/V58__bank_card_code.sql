-- 계좌·카드의 [계좌코드]·[계좌명]·[카드코드].
-- 원본 계좌등록 조건: 계좌코드 · 계좌명 · 계정 · 검색창내용 · 외화통장환종 · 사용구분
-- 원본 카드등록 조건: 카드코드 · 검색창내용 · 사용구분
--
-- 이 저장소의 다른 마스터(품목·거래처·창고·프로젝트·사원)는 <b>모두 코드로 식별</b>되는데
-- 계좌·카드만 코드가 없었다. 그래서 코드도움에서도 <b>이름으로만</b> 찾을 수 있었고,
-- 은행·계좌번호를 통째로 외우지 않으면 고를 수가 없었다.
-- [계좌명]은 '주거래통장' 처럼 사람이 부르는 이름이다 — 은행명+계좌번호로는 그게 안 된다.
--
-- 기존 행에는 코드가 없으므로 nullable 로 둔다. 채워 넣기 전에는 이름으로 찾으면 된다.
alter table bank_accounts add column code varchar(20);
alter table bank_accounts add column name varchar(100);
alter table credit_cards add column code varchar(20);

create index idx_bank_accounts_code on bank_accounts (code);
create index idx_credit_cards_code on credit_cards (code);
