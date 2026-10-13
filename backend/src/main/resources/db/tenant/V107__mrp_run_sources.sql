-- 생산계획/MRP 생성 팝업의 [생산계획대상-전표] — 무엇을 근거로 셀지(2026-10-02 loginaa 실측: 미판매 ✓ · 매출계획 ✓ · 미구매 ✓ ·
-- 미생산/미소모 ✗ 가 기본이다). 우리는 늘 셋 다 셌다 — 원본 기본값으로 계산하면 열린 작업지시를 안 센다.
-- 매출계획은 거래처·금액 단위라 품목 수량이 안 나와 칸을 두지 않는다.
ALTER TABLE mrp_runs ADD COLUMN src_unsold boolean NOT NULL DEFAULT true;
ALTER TABLE mrp_runs ADD COLUMN src_unpurchased boolean NOT NULL DEFAULT true;
ALTER TABLE mrp_runs ADD COLUMN src_unproduced boolean NOT NULL DEFAULT false;
