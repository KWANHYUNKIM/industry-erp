-- 계약조회 진행상태 알약(전체 · 확인 · 진행중 · 완료) — [종결] · [종결취소](원본 2026-10-22 실측: 확인 없이 완료로 넘어가고 되돌린다)
ALTER TABLE billing_contracts ADD COLUMN closed boolean NOT NULL DEFAULT false;
