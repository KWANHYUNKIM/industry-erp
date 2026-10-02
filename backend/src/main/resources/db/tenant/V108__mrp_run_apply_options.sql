-- 생산계획/MRP생성 팝업 [생산계획생성기준]·[MRP생성기준] → [설정] 의 적용기준(2026-10-02 loginaa 실측).
-- 생산계획: 안전재고반영 ✓ · 최소증가단위 ✗ / MRP: 안전재고반영 ✓ · 최소증가단위 ✓ 가 기본이다.
-- 우리는 늘 둘 다 반영했다 — 원본 기본값이면 생산계획수량을 최소증가단위로 올리지 않는다.
ALTER TABLE mrp_runs ADD COLUMN plan_safety boolean NOT NULL DEFAULT true;
ALTER TABLE mrp_runs ADD COLUMN plan_min_unit boolean NOT NULL DEFAULT false;
ALTER TABLE mrp_runs ADD COLUMN mrp_safety boolean NOT NULL DEFAULT true;
ALTER TABLE mrp_runs ADD COLUMN mrp_min_unit boolean NOT NULL DEFAULT true;
