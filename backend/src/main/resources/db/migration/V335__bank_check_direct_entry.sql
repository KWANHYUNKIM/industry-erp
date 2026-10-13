-- 수령(발행)수표내역입력 — 분개 없이 수표만 늘리고 줄이는 직접입력(원본 거래유형 '수표만증가' · '수표만감소').
ALTER TABLE bank_checks ADD COLUMN direct_entry boolean NOT NULL DEFAULT false;
