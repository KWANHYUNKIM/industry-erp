-- 원본 A/S수리입력(E040605)은 [거래처] 없이도 수리를 받는다(2026-10-13 loginaa 실측 — 거래처 없는 접수를 불러와 그대로 저장됨).
ALTER TABLE as_repairs ALTER COLUMN partner_id DROP NOT NULL;
