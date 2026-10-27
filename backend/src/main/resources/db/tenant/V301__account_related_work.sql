-- 회계1 계정등록(E010107) 계정속성: 거래처별집계구분(◉없음 ○거래처별) · 관련업무(없음 · 예금 · 차입금 · 어음 · 유형고정자산 · 무형고정자산 · 채권/채무).
-- 2026-10-21 loginaa 실측: 거래처관리대장 I · II(채권 · 채무)는 관련업무가 '채권/채무' 인 계정만 센다
--   (1089 외상매출금 = 채권/채무 · 거래처별 → 잡힘, 1209 미수금 = 없음 · 거래처별 → 계정별원장에만 거래처가 찍히고 대장에는 안 잡힘).
-- 지금까지 화면이 108 · 251 을 박아 두고 있던 것을 계정 설정으로 옮긴다.
ALTER TABLE accounts ADD COLUMN related_work varchar(30) NOT NULL DEFAULT 'NONE';
ALTER TABLE accounts ADD CONSTRAINT accounts_related_work_check CHECK (related_work IN
    ('NONE', 'DEPOSIT', 'BORROWING', 'NOTE', 'TANGIBLE_ASSET', 'INTANGIBLE_ASSET', 'RECEIVABLE_PAYABLE'));
ALTER TABLE accounts ADD COLUMN partner_aggregate boolean NOT NULL DEFAULT false;

UPDATE accounts SET related_work = 'RECEIVABLE_PAYABLE', partner_aggregate = true WHERE code IN ('108', '251');
UPDATE accounts SET partner_aggregate = true WHERE name IN ('미수금', '미지급금');
