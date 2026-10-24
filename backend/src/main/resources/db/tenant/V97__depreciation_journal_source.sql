-- 감가상각 분개의 출처 id 를 자산 id 가 아니라 상각 행(depreciations.id)으로 (QA 34회차)
--
-- createFromDepreciation 이 source_id 에 자산 id 를 넣어, uk_journal_entries_source(source_type, source_id)
-- 때문에 한 자산은 첫 달 말고는 상각할 수 없었다(두 번째 달부터 409 "이미 같은 값이 등록돼 있습니다").
-- 앞으로는 상각 행 id 를 쓴다. 옛 분개도 같은 뜻으로 맞춘다 — 안 맞추면 새 상각 행 id 가
-- 옛 분개의 자산 id 와 우연히 같을 때 또 부딪힌다.
--
-- 유니크 제약은 줄마다 바로 검사하므로, 값을 바로 바꾸면 중간에 서로 부딪힐 수 있다.
-- 먼저 음수로 옮겼다가(양수와 안 겹친다) 양수로 되돌린다. 지우는 행은 없다.
UPDATE journal_entries je
   SET source_id = -d.id
  FROM depreciations d
 WHERE d.journal_entry_id = je.id
   AND je.source_type = 'DEPRECIATION';

UPDATE journal_entries
   SET source_id = -source_id
 WHERE source_type = 'DEPRECIATION'
   AND source_id < 0;
