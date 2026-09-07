-- 품질검사요청의 [검사방법] — 원본 품질검사요청입력(ESJ002M) 격자의 열.
--
-- 실측: <b>전수</b>(L) · <b>샘플링(%)</b>(S) 두 갈래이고, 샘플링이면 옆 칸에 <b>비율</b>을 적는다.
--
-- 우리는 몇 개를 검사해 달라는 <b>수량</b>만 적었다. 전수인지 샘플인지가 없으면
-- 검사자가 100개를 다 봐야 하는지 몇 개만 봐도 되는지 알 수 없어, 요청서를 받고
-- 되물어야 했다. 안 정할 수도 있다 — 예전 요청에는 없다.
ALTER TABLE quality_inspection_requests ADD COLUMN inspect_method varchar(10);
ALTER TABLE quality_inspection_requests ADD COLUMN sample_percent numeric(5,2);
