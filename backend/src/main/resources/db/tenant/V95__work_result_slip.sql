-- 작업내역입력을 원본처럼 <전표 하나 = 여러 줄 = 번호 하나> 로(생산입고 V218 · 작업지시서 V219 와 같은 까닭).
-- 같은 result_no 를 가진 행들이 한 전표다.

ALTER TABLE work_results DROP CONSTRAINT uq_work_results_result_no;
CREATE INDEX idx_work_results_result_no ON work_results (result_no);
