-- BOR(작업소요시간) — 품목별 작업 라우팅.
--
-- 원본(이카운트) BOR 은 생산품목마다 <생산공정 · 작업순서 · 작업명 · 작업시간(H)> 을 적어 두는
-- 마스터다(사본 열: 생산품목코드·생산품목명·품목구분·생산공정명·생산수량·작업순서·작업명·작업시간(H)).
-- 우리에게는 공정 마스터만 있고 "이 품목이 어느 공정을 어떤 순서로 몇 시간 거치는가" 가 없었다.
-- 그래서 작업지시서효율현황의 '시간 표준' 은 실제로 작업한 공정만 되짚어 셀 수밖에 없었고,
-- 표준원가의 노무비는 배부할 근거가 없어 0 이었다.
--
-- base_qty: 그 작업시간이 몇 개를 만드는 기준인가. 1개 기준이면 1, 100개 로트 기준이면 100.
-- 원본에도 [생산수량] 열이 그 자리에 있다.
CREATE TABLE bor_operations (
    id            bigserial PRIMARY KEY,
    product_id    bigint       NOT NULL REFERENCES items(id),
    process_id    bigint       NOT NULL REFERENCES production_processes(id),
    seq           integer      NOT NULL,
    work_name     varchar(100) NOT NULL,
    base_qty      numeric(15,3) NOT NULL DEFAULT 1,
    work_hours    numeric(10,3) NOT NULL DEFAULT 0,
    remark        varchar(255),
    active        boolean      NOT NULL DEFAULT true,
    created_at    timestamp,
    updated_at    timestamp
);

-- FK 컬럼 인덱스는 직접 만든다(PostgreSQL 은 자동 생성하지 않는다).
CREATE INDEX idx_bor_operations_product ON bor_operations (product_id);
CREATE INDEX idx_bor_operations_process ON bor_operations (process_id);

-- 한 품목 안에서 작업순서는 겹치지 않는다.
CREATE UNIQUE INDEX uq_bor_operations_product_seq ON bor_operations (product_id, seq);
