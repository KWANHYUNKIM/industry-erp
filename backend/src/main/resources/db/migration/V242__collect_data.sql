-- 데이터센터 › 수집데이터등록(C001401) — 원본은 '이메일로 받은 문서를 모을 규칙'을 등록한다.
-- 수집대상 Email + [수신문서](거래명세서·견적서·발주서) + [보낸회사]. 문서마다 기본 줄이 하나씩 처음부터 있다.
-- (예전 collect_sources 는 우리 API 엔드포인트 목록이었다 — 데이터수집 화면이 계속 그 표를 읽는다.)
CREATE TABLE collect_data (
    id             bigserial PRIMARY KEY,
    code           varchar(20) UNIQUE,
    name           varchar(100) NOT NULL,
    channel        varchar(10)  NOT NULL DEFAULT 'EMAIL',
    doc_type       varchar(20)  NOT NULL CHECK (doc_type IN ('STATEMENT','QUOTATION','PURCHASE_ORDER')),
    sender_company varchar(100),
    built_in       boolean      NOT NULL DEFAULT false,
    created_by     varchar(50),
    updated_by     varchar(50),
    created_at     timestamp,
    updated_at     timestamp
);

INSERT INTO collect_data (name, doc_type, built_in, created_at, updated_at) VALUES
    ('거래명세서', 'STATEMENT',      true, now(), now()),
    ('견적서',     'QUOTATION',      true, now(), now()),
    ('발주서',     'PURCHASE_ORDER', true, now(), now());
