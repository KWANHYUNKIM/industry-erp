-- 일용근로 근무기록확정 [근로일수] — 근무한 날의 수(원본 E020139: 일근무 4.5 · 근로일수 5.00). 옛 행은 비어 둔다.
ALTER TABLE daily_work_confirms ADD COLUMN work_days numeric(10,2);
