-- 관리 > 인사관리 > 인사카드등록(C001001) [인사자료]: 학력사항 · 경력사항 줄(날짜 둘 + 글자 칸 일곱).
CREATE TABLE employee_hr_details (
    id bigserial PRIMARY KEY,
    employee_id bigint NOT NULL,
    category varchar(20) NOT NULL,
    line_no integer NOT NULL,
    from_date date,
    to_date date,
    text1 varchar(100), text2 varchar(100), text3 varchar(100), text4 varchar(100),
    text5 varchar(100), text6 varchar(100), text7 varchar(100),
    CONSTRAINT fk_employee_hr_details_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT ck_employee_hr_details_category CHECK (category IN ('EDUCATION', 'CAREER'))
);
CREATE INDEX idx_employee_hr_details_employee ON employee_hr_details (employee_id);
