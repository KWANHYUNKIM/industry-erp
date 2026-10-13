-- 기타원천세 소득구분에 비거주자사업기타소득(NON_RESIDENT) — 원본 기타원천세입력의 네 번째 소득구분(2026-10-04 loginaa 실측).
-- 소득코드 40 사업소득 · 41 선박등 임대소득 · 42 인적용역소득 · 61 사용료소득 · 62 기타소득, 필요경비율 0 · 70 · 80, 세율은 직접 적는다.
ALTER TABLE other_withholdings DROP CONSTRAINT ck_other_withholdings_income_type;
ALTER TABLE other_withholdings ADD CONSTRAINT ck_other_withholdings_income_type
    CHECK (income_type IN ('BUSINESS', 'OTHER', 'INTEREST', 'DIVIDEND', 'NON_RESIDENT'));
