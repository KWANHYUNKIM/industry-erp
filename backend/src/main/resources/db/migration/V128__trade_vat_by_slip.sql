-- 전표 부가세를 '거래별'로 계산했는지 기록한다.
-- 이카운트 판매입력·구매입력 툴바의 [거래별부가세계산](원본 버튼 id `calcbySlipsubmain`).
--
-- 라인마다 반올림하면 잔돈이 쌓인다. 공급가액 3,333 짜리 세 줄이면
-- 라인별 = 333×3 = 999, 거래별 = round(9,999×0.1) = 1,000 으로 1원이 어긋난다.
-- 세금계산서는 전표 단위로 나가므로 어느 쪽에 맞출지는 업체가 고른다.
--
-- 버튼을 누른 '동작'이 아니라 전표의 '성질'로 저장한다 — 저장하지 않으면 같은 전표를 수정할 때
-- 조용히 라인별 계산으로 되돌아가 합계가 바뀐다.
--
-- 기존 전표는 전부 라인별로 계산돼 있으므로 false 가 정확한 값이다.
-- DEFAULT 를 주고 NOT NULL 을 함께 걸므로 CLAUDE.md 7.2 의 3단계가 필요 없다(백필이 DEFAULT 로 끝난다).

ALTER TABLE sales    ADD COLUMN vat_by_slip boolean NOT NULL DEFAULT false;
ALTER TABLE purchases ADD COLUMN vat_by_slip boolean NOT NULL DEFAULT false;
