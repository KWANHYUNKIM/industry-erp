-- 일정관리 라벨 마스터 — 원본 E070201 일정관리등록 [라벨] '라벨검색'(2026-10-13 실측): 라벨코드 · 라벨명 · 색상.
-- 달력 칸의 둥근 칩이 이 라벨의 색이다. 일정에는 schedule_events.label_text 에 이름으로 붙는다.
CREATE TABLE schedule_labels (
    id         bigserial   PRIMARY KEY,
    code       varchar(20) NOT NULL,
    name       varchar(20) NOT NULL,
    color      varchar(7)  NOT NULL,
    active     boolean     NOT NULL,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uq_schedule_labels_code UNIQUE (code)
);

-- 지금까지 일정에 이름으로만 붙어 있던 라벨을 마스터로 옮긴다(색은 기본 검정, 코드는 이름 차례로 00001 …).
INSERT INTO schedule_labels (code, name, color, active, created_at, updated_at)
SELECT lpad(row_number() OVER (ORDER BY name)::text, 5, '0'), name, '#000000', true, now(), now()
FROM (SELECT DISTINCT left(trim(label_text), 20) AS name FROM schedule_events
       WHERE label_text IS NOT NULL AND trim(label_text) <> '') s;
