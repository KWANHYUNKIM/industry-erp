-- 원천징수이행상황신고서 [소득자료반영기준] ◉신고기간 ○직접지정 — 직접지정이면 [급여대장] 에서 고른 대장(여러 개)의 급여를 싣는다.
ALTER TABLE withholding_returns ADD COLUMN direct_income boolean;
UPDATE withholding_returns SET direct_income = false WHERE direct_income IS NULL;
ALTER TABLE withholding_returns ALTER COLUMN direct_income SET NOT NULL;
ALTER TABLE withholding_returns ADD COLUMN pay_ledger_ids varchar(500);
