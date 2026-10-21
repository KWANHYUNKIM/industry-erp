-- 일용근로 수당 · 공제 계산식리스트(원본 E020136 [설정] → '계산식리스트' 창, 2026-10-21 실측).
-- 항목마다 적용시점(연/월)별 계산식을 둔다. 기본 '2010/01 ~' 줄은 이름 · 지급유형으로 만든 자동 계산식이라 행이 없고,
-- [신규(F2)] 로 더한 적용시점만 여기 남는다. 급여계산은 대장 귀속연월 이하의 가장 늦은 적용시점 계산식을 쓴다
-- (원본: 2026/10 ~ 'QA관리-수당(급여지급사항)' 을 더하자 2026/10 대장 수당이 내역 1,000 × 근무기록 3 = 3,000 이 아니라 1,000).
CREATE TABLE daily_pay_item_formulas (
    id           bigserial PRIMARY KEY,
    item_id      bigint       NOT NULL REFERENCES daily_pay_items (id) ON DELETE CASCADE,
    apply_month  varchar(7)   NOT NULL,
    formula      varchar(500) NOT NULL,
    created_at   timestamp,
    updated_at   timestamp,
    CONSTRAINT uk_daily_pay_item_formulas_item_month UNIQUE (item_id, apply_month)
);
