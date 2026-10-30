-- 일정의 [라벨]을 이름 글자(label_text)가 아니라 라벨코드(label_code)로 붙인다.
-- 원본 일정관리(2026-10-30 loginaa 실측): 달력 칩 · 일정조회 · [라벨] 거르기가 모두 라벨 마스터의 코드로 묶여 있어
-- '라벨수정'에서 이름 · 색을 바꾸면 이미 넣은 일정의 칩도 따라 바뀐다. 이름과 색은 읽을 때 마스터에서 붙인다.

ALTER TABLE schedule_events ADD COLUMN label_code varchar(20);

-- 마스터에 없는 옛 라벨 이름은 지우지 않고 마스터에 더해 둔다(색은 기본 검정, 코드 M00001 …).
INSERT INTO schedule_labels (code, name, color, active, created_at, updated_at)
SELECT 'M' || lpad(row_number() OVER (ORDER BY s.name)::text, 5, '0'), s.name, '#000000', true, now(), now()
FROM (SELECT DISTINCT left(trim(e.label_text), 20) AS name FROM schedule_events e
       WHERE e.label_text IS NOT NULL AND trim(e.label_text) <> '') s
WHERE NOT EXISTS (SELECT 1 FROM schedule_labels l WHERE l.name = s.name);

-- 같은 이름이 둘이면 코드가 앞선 것.
UPDATE schedule_events e
   SET label_code = (SELECT min(l.code) FROM schedule_labels l WHERE l.name = left(trim(e.label_text), 20))
 WHERE e.label_text IS NOT NULL AND trim(e.label_text) <> '';

ALTER TABLE schedule_events DROP COLUMN label_text;
