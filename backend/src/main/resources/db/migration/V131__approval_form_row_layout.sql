-- 양식의 셀 배치(레이아웃) — 여러 필드를 한 줄에 놓는다.
--
-- 이카운트 기안서작성은 「신청일자 | 2026-08-25 15:01 ~ 2026-08-25 15:01」처럼
-- **시작·종료를 한 줄에 범위로** 놓는다. 우리는 두 줄로 나뉘어 있었다.
-- 원인은 스타일이 아니라 모델이다 — 우리 field_schema 는 '필드의 평면 목록'이라 배치 정보가 없었다.
--
-- field_schema 는 jsonb 라 **스키마 변경 없이** 키만 더하면 된다. 더하는 키는 셋이다.
--   row      : 같은 값을 가진 필드들을 한 줄에 그린다(그 줄의 식별자).
--   rowLabel : 그 줄의 라벨. 줄의 첫 필드에만 준다. 없으면 첫 필드의 label 을 쓴다.
--   sep      : 앞 필드와 이 필드 사이에 넣을 글자(예: '~').
--
-- 라벨이 '…(시작)' 인 필드와 바로 뒤따르는 '…(종료)' 를 한 줄로 묶는다.
-- 라벨 문자열로 판단하는 것이 마뜩잖지만, 이건 **1회성 데이터 보정**이지 런타임 규칙이 아니다.
-- 앞으로 만드는 양식은 처음부터 row 를 넣으면 된다.

WITH exploded AS (
    SELECT t.id,
           e.ord,
           e.elem,
           e.elem->>'label' AS label
    FROM approval_form_templates t,
         jsonb_array_elements(t.field_schema) WITH ORDINALITY AS e(elem, ord)
),
laid_out AS (
    SELECT id,
           ord,
           CASE
               -- 시작 필드: 이 줄의 주인. 라벨에서 '(시작)' 을 떼어 줄 라벨로 쓴다.
               WHEN label LIKE '%(시작)' THEN
                   elem || jsonb_build_object(
                       'row', ord,
                       'rowLabel', left(label, length(label) - 4))
               -- 종료 필드: 바로 앞 시작 필드와 같은 줄에, '~' 로 이어 붙인다.
               WHEN label LIKE '%(종료)' THEN
                   elem || jsonb_build_object('row', ord - 1, 'sep', '~')
               ELSE elem
           END AS elem
    FROM exploded
)
UPDATE approval_form_templates t
SET field_schema = s.arr
FROM (
    SELECT id, jsonb_agg(elem ORDER BY ord) AS arr
    FROM laid_out
    GROUP BY id
) s
WHERE t.id = s.id;
