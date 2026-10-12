-- 원본 공통양식등록 › 입력화면설정 › 기본값설정 › [구분] 코드도움 '구분검색'(2026-10-12 loginaa E070107 실측):
--  [그룹코드▼][그룹명▼] — 01 지출결의서 · 02 휴가신청서 · 03 신청서 · 04 출장보고서, 하단 [신규(F2)][수정][닫기].
--  양식마다 구분 기본값을 정해 두면 공통양식리스트 · 기안서작성 목록의 [구분] 열에 그 이름이 서고(휴가신청서 → 휴가신청서),
--  기안서작성 창의 [구분] 칸이 그 값으로 열린다.
CREATE TABLE approval_groups (
    id         bigserial   PRIMARY KEY,
    code       varchar(20) NOT NULL,
    name       varchar(50) NOT NULL,
    created_at timestamp,
    updated_at timestamp,
    CONSTRAINT uq_approval_groups_code UNIQUE (code)
);
INSERT INTO approval_groups (code, name, created_at, updated_at) VALUES
    ('01', '지출결의서', now(), now()),
    ('02', '휴가신청서', now(), now()),
    ('03', '신청서', now(), now()),
    ('04', '출장보고서', now(), now());

ALTER TABLE approval_form_templates ADD COLUMN group_code varchar(20);
UPDATE approval_form_templates SET group_code = '02' WHERE code = 'LEAVE';
