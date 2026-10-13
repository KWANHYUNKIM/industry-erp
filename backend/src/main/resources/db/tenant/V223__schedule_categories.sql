-- 일정관리 일정구분 마스터 — 원본 E070201 일정관리등록 [일정구분] 🔍 '일정구분검색' → [신규 및 수정] '일정구분리스트'
-- (2026-10-13 loginaa 실측): 일정구분코드 · 일정구분명 둘뿐, 코드는 001 · 002 … 다음 번호가 미리 채워진다.
-- 일정에는 schedule_events.category 에 이름으로 붙는다.
CREATE TABLE schedule_categories (
    id         bigserial   PRIMARY KEY,
    code       varchar(20) NOT NULL,
    name       varchar(30) NOT NULL,
    active     boolean     NOT NULL,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uq_schedule_categories_code UNIQUE (code)
);

-- 지금까지 일정에 글자로만 적혀 있던 구분을 마스터로 옮긴다(코드는 이름 차례로 001 …).
INSERT INTO schedule_categories (code, name, active, created_at, updated_at)
SELECT lpad(row_number() OVER (ORDER BY name)::text, 3, '0'), name, true, now(), now()
FROM (SELECT DISTINCT trim(category) AS name FROM schedule_events
       WHERE category IS NOT NULL AND trim(category) <> '') s;
