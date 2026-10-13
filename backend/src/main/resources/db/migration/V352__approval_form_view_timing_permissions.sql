-- 공통양식 입력화면설정 — 원본 E070107 (2026-10-13 loginaa 실측).
--  [기안서확인시점설정] 수신참조 확인시점 · 공유문서 확인시점: 기본설정 · 결재완료전 · 결재완료후
--    (기본설정 = 수신참조는 결재완료후, 공유는 결재완료전).
--  [사용자별권한] '대상자선택' 사용자마다 권한그룹 · 사용허가 · 사용불가 — 권한그룹(기본)은 여기에 적지 않는다.
ALTER TABLE approval_form_templates ADD COLUMN reference_view_timing varchar(10);
ALTER TABLE approval_form_templates ADD COLUMN share_view_timing varchar(10);
ALTER TABLE approval_form_templates ADD COLUMN user_permissions jsonb;
UPDATE approval_form_templates SET reference_view_timing = 'DEFAULT', share_view_timing = 'DEFAULT', user_permissions = '{}'::jsonb;
ALTER TABLE approval_form_templates ALTER COLUMN reference_view_timing SET NOT NULL;
ALTER TABLE approval_form_templates ALTER COLUMN share_view_timing SET NOT NULL;
ALTER TABLE approval_form_templates ALTER COLUMN user_permissions SET NOT NULL;
ALTER TABLE approval_form_templates ADD CONSTRAINT approval_form_templates_reference_view_timing_check
    CHECK (reference_view_timing IN ('DEFAULT', 'BEFORE', 'AFTER'));
ALTER TABLE approval_form_templates ADD CONSTRAINT approval_form_templates_share_view_timing_check
    CHECK (share_view_timing IN ('DEFAULT', 'BEFORE', 'AFTER'));
