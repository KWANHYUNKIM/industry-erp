-- 작업내역에 전표번호를 준다.
--
-- 원본 작업내역조회 격자의 첫 열은 [일자-No.] 다(사본 실측). 우리는 [일자] 한 칸뿐이라
-- 작업내역 한 줄을 가리킬 이름이 없었다 — "어느 작업내역을 고쳤다/지웠다" 고 말할 방법이
-- 없다는 뜻이다. 매출계획이 같은 까닭으로 SP- 채번을 얻었다(V205).
--
-- work_date 는 진작 NOT NULL 이라 날짜는 백필할 것이 없다.
-- 데이터가 있는 테이블이라 세 걸음으로 나눈다(nullable 추가 → 백필 → NOT NULL).

ALTER TABLE work_results ADD COLUMN result_no varchar(30);
UPDATE work_results w SET result_no = n.no FROM (
  SELECT id, 'WR-' || to_char(work_date, 'YYYYMMDD') || '-'
         || lpad((row_number() OVER (PARTITION BY work_date ORDER BY id))::text, 4, '0') AS no
    FROM work_results
) n WHERE w.id = n.id AND w.result_no IS NULL;
ALTER TABLE work_results ALTER COLUMN result_no SET NOT NULL;
ALTER TABLE work_results ADD CONSTRAINT uq_work_results_result_no UNIQUE (result_no);
