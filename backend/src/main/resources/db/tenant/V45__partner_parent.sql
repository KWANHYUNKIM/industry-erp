-- 거래처 관계설정 — 대표거래처 ↔ 종속거래처.
--
-- 원본 근거(사본):
--   * 거래처리스트 · 품목등록 리스트 하단 버튼에 [관계설정] 이 있다
--   * 거래처관리대장 II 조건에 [대표거래처로 합산] 이 있고, 그 값이
--     '거래처관계기준' 과 '개별거래처기준' 둘이다
-- 한 회사가 사업장·지점별로 거래처코드를 따로 쓰는 경우(원본 자료에도
-- '대신화물대전신일점' 처럼 지점 단위 거래처가 있다) 채권채무를 회사 단위로
-- 봐야 하는데, 우리는 코드 단위로밖에 볼 수 없었다.
--
-- 두 단계까지만 둔다(대표 → 종속). 대표거래처가 다시 남의 종속이 되면
-- 합산이 어디서 멈추는지가 사람마다 다르게 읽힌다.
ALTER TABLE business_partners ADD COLUMN parent_id bigint REFERENCES business_partners(id);

CREATE INDEX idx_business_partners_parent ON business_partners (parent_id);
