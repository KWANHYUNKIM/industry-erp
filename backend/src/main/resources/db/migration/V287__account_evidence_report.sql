-- 지출증빙현황(E030402) [Option › 계정설정] — 계정마다 인쇄방법 '표시안함 / 표시'.
-- 원본은 337개 계정이 모두 '표시안함' 으로 시작해 표시로 고른 계정만 판에 나온다(2026-10-04 실측).
ALTER TABLE accounts ADD COLUMN evidence_report boolean NOT NULL DEFAULT false;
