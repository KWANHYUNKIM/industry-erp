-- 4대보험 취득 · 상실 · 피부양자 신고의 주민등록번호 · 신고 성명(원본 N001769~71: 주민등록번호 필수 · 성명은 한글만).
ALTER TABLE insurance_reports ADD COLUMN resident_no varchar(13);
ALTER TABLE insurance_reports ADD COLUMN report_name varchar(50);
