-- 기타원천세입력 이자배당소득 전용 칸(2026-10-04 loginaa 실측) — 이자 · 배당소득 지급명세서에 들어가는 값.
-- 계좌(발행)번호 · 과세구분코드(T 일반과세 · C 법인 원천징수대상 …) · 조세특례코드(NN …) · 금융상품코드(구분 글자 + 번호, A3C …) ·
-- 유가증권코드 · 채권이자구분 · 지급대상기간 시작일 · 종료일 · 이자율 등 · 변동자료구분(처음제출 · 삭제 · 수정 서식개정전/후) ·
-- 변동자료제출연월 · 신탁이익. 다른 소득구분 줄은 비워 둔다.
ALTER TABLE other_withholdings ADD COLUMN account_no varchar(50);
ALTER TABLE other_withholdings ADD COLUMN taxation_code varchar(1);
ALTER TABLE other_withholdings ADD COLUMN special_code varchar(2);
ALTER TABLE other_withholdings ADD COLUMN product_code varchar(3);
ALTER TABLE other_withholdings ADD COLUMN security_code varchar(30);
ALTER TABLE other_withholdings ADD COLUMN bond_interest_code varchar(2);
ALTER TABLE other_withholdings ADD COLUMN period_from date;
ALTER TABLE other_withholdings ADD COLUMN period_to date;
ALTER TABLE other_withholdings ADD COLUMN interest_rate numeric(9, 4);
ALTER TABLE other_withholdings ADD COLUMN change_kind varchar(10)
    CHECK (change_kind IN ('FIRST', 'DELETE', 'AMEND_OLD', 'AMEND_NEW'));
ALTER TABLE other_withholdings ADD COLUMN change_month varchar(7);
ALTER TABLE other_withholdings ADD COLUMN trust_income boolean NOT NULL DEFAULT false;
