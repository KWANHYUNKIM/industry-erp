-- 생산입고 ↔ 작업내역 연결 — 원본 작업내역입력 툴바 [연결전표] → 생산입고연결전표(2026-10-02 loginaa 실측).
-- 작업내역 전표(같은 result_no 의 줄들)에서 [신규] 로 만든 생산입고가 그 번호를 든다. 작업내역은 번호 하나에 줄이 여럿이라
-- FK 대신 번호를 그대로 든다(생산입고·작업지시가 서로를 번호로 무는 것과 같다).
ALTER TABLE productions ADD COLUMN work_result_no varchar(30);
CREATE INDEX idx_productions_work_result_no ON productions (work_result_no);
