-- 거래처의 [모바일]과 [이체정보].
--
-- 원본 거래처리스트의 열은 거래처코드 · 거래처명 · 대표자명 · 전화 · 모바일 ·
-- 검색창내용 · 사용구분 · 이체정보다.
--
-- 우리 거래처에는 전화 한 칸뿐이라 담당자 휴대폰을 적을 자리가 없었고,
-- 이체정보(지급할 계좌)는 아예 없어서 지급할 때마다 딴 데서 찾아야 했다.
alter table business_partners add column mobile varchar(50);
alter table business_partners add column bank_name varchar(100);
alter table business_partners add column account_no varchar(50);
alter table business_partners add column account_holder varchar(100);
