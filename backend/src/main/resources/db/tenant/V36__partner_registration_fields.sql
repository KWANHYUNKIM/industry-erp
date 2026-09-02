-- 거래처등록에 원본 [거래처정보] 탭의 남은 칸들.
--
-- 거래처관리대장 II 사본의 거래처검색 팝업이 조건으로 걸고 있는 것들이다. 조건에 있다는
-- 것은 마스터에 그 값이 있다는 뜻이다. 순서도 원본 탭 순서를 따랐다.
--
--   거래처코드구분(사업자등록번호·주민등록번호·외국인) · 종사업장번호 · 세무신고거래처 ·
--   주소2 + 주소2 우편번호 · 업종별구분(일반·관세사·외화거래처) · 홈페이지 · 적요 ·
--   출하대상거래처
--
-- 거래처코드구분은 그냥 두는 값이 아니다. [사업자등록번호]면 10자리, [주민등록번호]면
-- 13자리여야 한다 — 지금까지 우리는 등록번호를 아무 글자나 받았다. 세금계산서에 그대로
-- 찍히는 값이라 틀린 채로 들어가면 발행하고 나서야 안다.
--
-- 거래유형(영업)·거래유형(구매)와 거래처그룹2·거래처계층그룹은 만들지 않았다.
-- 사본에 값이 '기본설정 · 직접입력' 으로만 찍혀 있어 무엇을 정하는 값인지 알 수 없다.
-- 뜻을 모르는 칸을 만들면 화면에는 있는데 아무 일도 안 하는 칸이 된다.

ALTER TABLE business_partners ADD COLUMN reg_no_kind varchar(20);
UPDATE business_partners SET reg_no_kind = '사업자등록번호' WHERE reg_no_kind IS NULL;
ALTER TABLE business_partners ALTER COLUMN reg_no_kind SET NOT NULL;

ALTER TABLE business_partners ADD COLUMN industry_kind varchar(20);
UPDATE business_partners SET industry_kind = '일반' WHERE industry_kind IS NULL;
ALTER TABLE business_partners ALTER COLUMN industry_kind SET NOT NULL;

ALTER TABLE business_partners ADD COLUMN sub_biz_no varchar(20);
ALTER TABLE business_partners ADD COLUMN postal_code2 varchar(20);
ALTER TABLE business_partners ADD COLUMN address2 varchar(300);
ALTER TABLE business_partners ADD COLUMN homepage varchar(200);
ALTER TABLE business_partners ADD COLUMN remark varchar(500);

-- 세무신고거래처: 부가세 신고 대상으로 잡을 거래처인지. 기본은 대상이다.
ALTER TABLE business_partners ADD COLUMN tax_report boolean;
UPDATE business_partners SET tax_report = true WHERE tax_report IS NULL;
ALTER TABLE business_partners ALTER COLUMN tax_report SET NOT NULL;

-- 출하대상거래처: 출하지시 대상으로 뜰 거래처인지. 기본은 대상이다.
ALTER TABLE business_partners ADD COLUMN shipment_target boolean;
UPDATE business_partners SET shipment_target = true WHERE shipment_target IS NULL;
ALTER TABLE business_partners ALTER COLUMN shipment_target SET NOT NULL;
