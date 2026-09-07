-- 거래처의 Email · Fax · 여신한도.
--
-- 원본 근거(사본 '거래처관리대장 I'): 대장 머리말이 그 거래처의
--   사업자등록번호 · 대표자 · <b>여신한도</b> · 전화 · <b>Email</b> · <b>Fax</b> · 주 소 · 기타사항
-- 을 찍는다. 실제 값도 같이 찍혀 있다(Email seunghak96@naver.com).
-- 우리 거래처에는 셋 다 적을 자리가 없어서, 대장을 인쇄해도 머리말이 비어 있었다.
--
-- 여신한도는 금액이다. 0 은 '한도 없음' 이 아니라 원본이 실제로 0 을 찍고 있는 값이라
-- 기본값 0 으로 둔다.
ALTER TABLE business_partners ADD COLUMN email varchar(150);
ALTER TABLE business_partners ADD COLUMN fax varchar(50);

ALTER TABLE business_partners ADD COLUMN credit_limit numeric(15,2);
UPDATE business_partners SET credit_limit = 0 WHERE credit_limit IS NULL;
ALTER TABLE business_partners ALTER COLUMN credit_limit SET NOT NULL;
