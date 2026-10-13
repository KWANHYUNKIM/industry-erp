-- 원본 A/S접수입력(E040601)은 [거래처] 없이도 접수를 받는다(2026-10-13 loginaa 실측 — 빈 채 저장하면 창고 · 품목 · 수량만 빨갛다).
ALTER TABLE as_requests ALTER COLUMN partner_id DROP NOT NULL;
