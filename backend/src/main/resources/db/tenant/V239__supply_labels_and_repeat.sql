-- 공용품관리(E070204) 라벨 마스터와 반복설정 — 원본 2026-10-13 loginaa 실측.
-- [라벨] 🔍 '라벨검색창' · 하단 [라벨변경 ▾ › 라벨설정] '라벨조회': 라벨코드 · 라벨명 · 색상. 일정관리 라벨과 다른 목록이다
-- (원본 일정관리에는 라벨이 여럿인데 공용품관리 라벨검색창은 비어 있었다). 사용내역에는 supply_usages.label_text 에 이름으로 붙는다.
CREATE TABLE supply_labels (
    id         bigserial   PRIMARY KEY,
    code       varchar(20) NOT NULL,
    name       varchar(20) NOT NULL,
    color      varchar(7)  NOT NULL,
    active     boolean     NOT NULL,
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT uq_supply_labels_code UNIQUE (code)
);

-- 지금까지 이름으로만 붙어 있던 라벨을 마스터로 옮긴다(색은 기본 검정, 코드는 이름 차례로 00001 …).
INSERT INTO supply_labels (code, name, color, active, created_at, updated_at)
SELECT lpad(row_number() OVER (ORDER BY name)::text, 5, '0'), name, '#000000', true, now(), now()
FROM (SELECT DISTINCT left(trim(label_text), 20) AS name FROM supply_usages
       WHERE label_text IS NOT NULL AND trim(label_text) <> '') s;

-- [반복설정] 으로 저장하면 날마다 한 줄씩 생기고 같은 묶음으로 남는다 — 수정 · 삭제가 '이번 일정만 / 향후 모든 일정 / 전체 반복일정' 을 묻는다.
ALTER TABLE supply_usages ADD COLUMN repeat_group varchar(40);
ALTER TABLE supply_usages ADD COLUMN repeat_rule varchar(200);
CREATE INDEX idx_supply_usages_repeat_group ON supply_usages (repeat_group);
