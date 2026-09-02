-- 작업내역에 <b>투입자원</b>(설비)을 붙인다.
--
-- 원본(이카운트) 작업내역입력의 그리드 열은
--   생산품목코드 · 생산품목명 · 작업품목코드 · 작업품목명 · 수량 · <b>투입자원</b> · 작업시간 · 적요
-- 다. 우리 작업내역에는 공정·작업자·수량·시간만 있어서 <b>어느 설비로 했는지</b>가 없었다.
-- 자원등록에 [대상작업](공정)을 붙여 뒀으니, 여기서 그 자원을 지목하면 짝이 맞는다.
ALTER TABLE work_results ADD COLUMN resource_id bigint REFERENCES production_resources(id);
CREATE INDEX idx_work_results_resource ON work_results (resource_id);
