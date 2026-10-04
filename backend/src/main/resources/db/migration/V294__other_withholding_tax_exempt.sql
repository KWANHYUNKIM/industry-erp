-- 기타원천세입력 [소액부징수] · [과세최저한] (2026-10-04 loginaa 실측) — 고른 줄의 세액을 0 으로 두고 그 까닭을 남긴다.
-- SMALL 소액부징수(소득세 1,000원 미만, 기타 · 이자배당 줄. 사업소득 줄은 원본도 바뀌지 않는다),
-- MIN 과세최저한(기타소득금액 50,000원 이하). 다시 열어 고쳐도 0 이 유지되고, 지급명세서 '소액부징수 연간 합계' 가 이것으로 센다.
ALTER TABLE other_withholdings ADD COLUMN tax_exempt varchar(10) CHECK (tax_exempt IN ('SMALL', 'MIN'));
