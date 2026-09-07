-- 사원(담당)등록(E010107) 폼의 빠진 칸들.
-- 사원등록이 곧 담당자 등록인데(원본 이름이 '사원(담당)등록'이다) 연락할 길이 없었다.
ALTER TABLE employees ADD COLUMN phone varchar(30);
ALTER TABLE employees ADD COLUMN email varchar(100);
ALTER TABLE employees ADD COLUMN search_keyword varchar(100);
ALTER TABLE employees ADD COLUMN remark varchar(200);
