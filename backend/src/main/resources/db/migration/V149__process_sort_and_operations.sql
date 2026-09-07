-- 공정에 <b>순번</b>을 붙이고, 그 공정의 <b>작업코드</b> 마스터를 만든다.
--
-- 원본(이카운트) 공정등록의 열은 생산공정코드 · 생산공정명 · <b>순번</b> · <b>작업코드등록</b> 이다.
--
-- 순번이 없으면 공정을 고르는 자리(BOR·작업내역·자원등록)에서 코드순으로만 나온다.
-- 공정은 흐름이라 반제품공정 → 완제품공정 → 설치공정처럼 <b>순서대로</b> 보여야 고르기 쉽다.
--
-- 작업코드는 그 공정 안에서 하는 작업들이다. 지금은 BOR 의 작업명을 자유입력으로 받는데,
-- 같은 작업이 '절단'·'절단작업'·'컷팅' 으로 여러 이름이 되면 집계가 갈라진다.
ALTER TABLE production_processes ADD COLUMN sort_order integer;
UPDATE production_processes SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE production_processes ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE production_processes ALTER COLUMN sort_order SET DEFAULT 0;

CREATE TABLE process_operations (
    id          bigserial PRIMARY KEY,
    process_id  bigint       NOT NULL REFERENCES production_processes(id) ON DELETE CASCADE,
    code        varchar(30)  NOT NULL,
    name        varchar(100) NOT NULL,
    seq         integer      NOT NULL DEFAULT 0,
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamp,
    updated_at  timestamp
);

CREATE INDEX idx_process_operations_process ON process_operations (process_id);
-- 작업코드는 회사 안에서 유일하다. 같은 코드가 두 공정에 있으면 어느 쪽인지 알 수 없다.
CREATE UNIQUE INDEX uq_process_operations_code ON process_operations (code);
