-- 결의서 격자 줄의 [수수료](입금보고서 E010403 격자 끝 열) · [거래처명] 글자(지출결의서 E010408 — 코드 없이 '스타벅스').
ALTER TABLE fast_voucher_lines ADD COLUMN fee numeric(18,2);
ALTER TABLE fast_voucher_lines ADD COLUMN payee_name varchar(100);
