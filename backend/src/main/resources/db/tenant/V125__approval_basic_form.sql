-- 기안서작성 맨 위 '00 기본' 양식(원본 E070103, 2026-10-03 실측).
--
-- 원본 양식 목록 맨 위에는 회사가 만든 양식과 별개로 '00 기본' 줄이 초록 바탕으로 붙어 있다 —
-- 칸 없이 제목 · 본문만 쓰는 기본 기안서다. 우리 양식 목록에는 없었다.
-- 칸이 없는 양식이라 field_schema 는 빈 배열(자유서식)이다. 화면은 code 'BASIC' 을 맨 위에 '00' 으로 붙인다.
INSERT INTO approval_form_templates (code, name, sort_order, field_schema)
VALUES ('BASIC', '기본', 0, '[]'::jsonb);
