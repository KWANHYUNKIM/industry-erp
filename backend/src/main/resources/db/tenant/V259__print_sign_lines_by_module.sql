-- 인쇄용결재라인등록(회계 E010106 · 재고 · 관리 E090102): 원본은 서식 목록이 아니라 모듈(회계 · 재고 · 관리)마다
-- 결재라인 1 · 2 고정 두 벌이고, 줄마다 맨 왼쪽 [결재라인] 칸(명칭 · 가로 · 글자) + 결재자 1 ~ 9(명칭 · 가로(px) · 글자(px))다.
-- 옛 기본 결재란은 회계 결재라인 1 로 옮기고, 기본이 아닌 서식은 새 모델에 자리가 없어 지운다(칸은 ON DELETE CASCADE).
DELETE FROM print_sign_lines WHERE is_default = false;

ALTER TABLE print_sign_lines ADD COLUMN module varchar(20);
ALTER TABLE print_sign_lines ADD COLUMN line_no integer;
ALTER TABLE print_sign_lines ADD COLUMN label_name varchar(30);
ALTER TABLE print_sign_lines ADD COLUMN label_width integer;
ALTER TABLE print_sign_lines ADD COLUMN label_font integer;

UPDATE print_sign_lines SET module = 'ACCOUNTING', line_no = 1, label_width = 26, label_font = 12;

ALTER TABLE print_sign_lines ALTER COLUMN module SET NOT NULL;
ALTER TABLE print_sign_lines ALTER COLUMN line_no SET NOT NULL;
ALTER TABLE print_sign_lines ADD CONSTRAINT print_sign_lines_module_check
    CHECK (module IN ('ACCOUNTING', 'INVENTORY', 'MANAGEMENT'));
ALTER TABLE print_sign_lines ADD CONSTRAINT print_sign_lines_line_no_check CHECK (line_no IN (1, 2));
ALTER TABLE print_sign_lines ADD CONSTRAINT uk_print_sign_lines_module_line UNIQUE (module, line_no);

-- 서식명 · 기본 · 사용 · 비고는 원본에 없다(이름 유일 제약 · is_default 인덱스는 열과 같이 사라진다)
ALTER TABLE print_sign_lines DROP COLUMN name;
ALTER TABLE print_sign_lines DROP COLUMN is_default;
ALTER TABLE print_sign_lines DROP COLUMN active;
ALTER TABLE print_sign_lines DROP COLUMN remark;

-- 칸: 명칭은 비울 수 있다(결재자 8 · 9 는 비어 있어도 글자크기를 든다), 가로(px) · 글자(px)
ALTER TABLE print_sign_slots ALTER COLUMN title DROP NOT NULL;
ALTER TABLE print_sign_slots DROP COLUMN signer_name;   -- 원본 칸에 결재자 이름이 없다(빈 도장 칸)
ALTER TABLE print_sign_slots ADD COLUMN width_px integer;
ALTER TABLE print_sign_slots ADD COLUMN font_px integer;
UPDATE print_sign_slots SET font_px = 11, width_px = 60;   -- 옛 칸은 지금처럼 찍히게(가로가 빈 칸은 인쇄에 안 나온다)
