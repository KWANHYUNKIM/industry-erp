-- 작업코드등록의 [투입자원유형] · [작업기준품목] — 원본 공정등록 줄마다 [작업코드등록] 창의 열
-- 작업코드 · 작업명 · 투입자원유형 · 작업기준품목(2026-10-29 데이터이관 QA 79회: 투입자원유형 '기계',
-- 작업기준품목 '생산품' · '소모품'). 이미 있는 작업코드는 비워 둔다(원본 값을 모른다).
-- 값은 서버(ProcessOperationService)가 본다 — 투입자원유형 기계 · 인력 · 외주, 작업기준품목 생산품 · 소모품.
ALTER TABLE process_operations ADD COLUMN resource_type varchar(20);
ALTER TABLE process_operations ADD COLUMN base_item varchar(20);
