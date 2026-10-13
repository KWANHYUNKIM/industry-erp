-- 원본 이익관리 > 원가생성/수정(E040802, 2026-10-12 loginaa 실측)의 한 줄 = 원가를 잡는 기간.
-- [신규] 기본등록: 시작월(앞 기간 다음 달로 잠김) · 종료월 · 원가계산법(총평균법 · 선입선출법 · 최종매입원가법) · 외주비기준(품목등록 · 실외주비).
-- 그 줄에서 사전작업(노무비/경비등록 · 표준원가생성) → 원가계산(생성) → 원가현황(조회 · 삭제) 을 한다.
CREATE TABLE cost_periods (
    id                 bigserial PRIMARY KEY,
    start_month        varchar(7)  NOT NULL,
    end_month          varchar(7)  NOT NULL,
    method             varchar(20) NOT NULL,
    outsourcing_basis  varchar(20) NOT NULL,
    generated          boolean     NOT NULL DEFAULT false,
    created_at         timestamp(6),
    updated_at         timestamp(6),
    CONSTRAINT uk_cost_periods_start UNIQUE (start_month),
    CONSTRAINT ck_cost_periods_method CHECK (method IN ('TOTAL_AVERAGE', 'FIFO', 'LAST_PURCHASE')),
    CONSTRAINT ck_cost_periods_basis CHECK (outsourcing_basis IN ('ITEM', 'ACTUAL'))
);
