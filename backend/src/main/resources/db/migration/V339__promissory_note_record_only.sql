-- 받을어음조회 · 지급어음조회 [내역만등록] — 회계전표 없이 어음 내역만 적은 것(원본 거래유형 '어음만증가', 회계전표일자-No. 빈칸).
-- loginaa 2026-10-13 실측: 받을어음내역입력 QA1-N1 10,000 저장 → 받을어음조회 줄 '어음만증가', 회계거래조회에 전표 없음.

ALTER TABLE promissory_notes ADD COLUMN record_only boolean NOT NULL DEFAULT false;
