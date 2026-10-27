-- 인사카드등록 [인사자료] 나머지 아홉 항목(자격ㆍ면허 · 가족 · 외국어 · 상벌 · 교육 · 출장 · 메모 · 근무실태 · 보증인).
-- 근무실태(글자 칸 열) · 자격ㆍ면허(날짜 넷)를 담으려고 칸을 늘린다.
ALTER TABLE employee_hr_details ADD COLUMN date3 date;
ALTER TABLE employee_hr_details ADD COLUMN date4 date;
ALTER TABLE employee_hr_details ADD COLUMN text8 varchar(100);
ALTER TABLE employee_hr_details ADD COLUMN text9 varchar(100);
ALTER TABLE employee_hr_details ADD COLUMN text10 varchar(100);
ALTER TABLE employee_hr_details DROP CONSTRAINT ck_employee_hr_details_category;
ALTER TABLE employee_hr_details ADD CONSTRAINT ck_employee_hr_details_category CHECK (category IN
    ('EDUCATION', 'CAREER', 'LICENSE', 'FAMILY', 'LANGUAGE', 'REWARD', 'TRAINING', 'TRIP', 'MEMO', 'WORK_STATUS', 'GUARANTOR'));
