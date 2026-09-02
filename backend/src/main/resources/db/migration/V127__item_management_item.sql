-- 품목에 관리항목을 붙인다.
-- 이카운트 품목등록(ESA009M) A7 탭의 [관리항목](`item_type`) 에 대응한다.
--
-- 지금까지 `management_items` 는 등록만 되고 아무 테이블도 참조하지 않는 죽은 마스터였다.
-- 원본 판매입력 그리드의 관리항목 열(`item_des`)은 <disabled> 라 사람이 라인에서 고르는 값이 아니고,
-- 품목에 설정된 값이 따라 붙기만 한다 — 그래서 전표 라인이 아니라 품목에 단다.
--
-- 선택 입력이라 nullable 이다 → 기존 행 백필 불필요.
-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1).

ALTER TABLE items ADD COLUMN management_item_id bigint;
ALTER TABLE items ADD CONSTRAINT fk_items_management_item
    FOREIGN KEY (management_item_id) REFERENCES management_items (id);
CREATE INDEX idx_items_management_item ON items (management_item_id);
