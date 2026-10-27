-- 거래처등록 [거래처정보] 탭: 세무신고거래처(코드동일 / 검색입력 / 직접입력 → 다른 코드) · 통화(내자 / 외화등록 통화).
ALTER TABLE business_partners ADD COLUMN tax_report_code varchar(30);
ALTER TABLE business_partners ADD COLUMN currency_code varchar(10);
