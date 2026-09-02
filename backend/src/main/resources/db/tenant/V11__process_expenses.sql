-- 노무비/경비등록 — 원가계산 전 사전작업.
--
-- 원본(이카운트) 원가생성/수정의 [사전작업] > [노무비/경비등록] 에 해당한다.
-- 사본의 열 id 가 구조를 알려 준다: PLANT_DES(공정명) · WH_CD/WH_DES(창고) ·
-- LABOR_XPNS(노무비) · ETC_XPNT(경비). 즉 <기준년월 · 공정 · 창고> 마다 그 달 실제로
-- 들어간 노무비와 경비 총액을 적어 둔다.
--
-- 이 표가 없어서 표준원가의 경비는 늘 0 이었다. 노무비는 공정 마스터의 시간당 비용으로
-- 갈음할 수 있었지만 경비는 요율이 아예 없어 지어낼 근거가 없었다.
CREATE TABLE process_expenses (
    id            bigserial PRIMARY KEY,
    period        varchar(7)   NOT NULL,
    process_id    bigint       NOT NULL REFERENCES production_processes(id),
    warehouse_id  bigint       REFERENCES warehouses(id),
    labor_cost    numeric(18,2) NOT NULL DEFAULT 0,
    overhead_cost numeric(18,2) NOT NULL DEFAULT 0,
    remark        varchar(255),
    created_at    timestamp,
    updated_at    timestamp
);

-- FK 컬럼 인덱스는 직접 만든다(PostgreSQL 은 자동 생성하지 않는다).
CREATE INDEX idx_process_expenses_process ON process_expenses (process_id);
CREATE INDEX idx_process_expenses_warehouse ON process_expenses (warehouse_id);
CREATE INDEX idx_process_expenses_period ON process_expenses (period);

-- 같은 달·같은 공정·같은 창고는 한 줄이다. 창고를 안 정한 줄(전사 공통)도 한 줄만 둔다.
CREATE UNIQUE INDEX uq_process_expenses_key
    ON process_expenses (period, process_id, coalesce(warehouse_id, 0));
