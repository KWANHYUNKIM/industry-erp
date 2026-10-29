-- 재고 II › A/S접수입력 — 원본 '새로운 항목 추가' 칸(머리 한 줄 글 · 품목 줄 적요, 2026-10-29 데이터이관 QA B4:
-- 줄 적요 '설치기사 부주의로 인한 반품' 등).
ALTER TABLE as_requests ADD COLUMN extra_note varchar(200);
ALTER TABLE as_request_lines ADD COLUMN note varchar(200);
