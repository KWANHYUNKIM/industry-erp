-- 품목등록 [품목정보] 의 [생산공정] — 원본은 공정을 고르는 태그 칸(2026-10-29 데이터이관 QA 79회: A001 → 조립).
-- BOR(작업소요시간) 목록이 이 값을 정한 품목(또는 BOR 줄이 있는 품목)만 보인다.
-- inventory 는 production 을 참조할 수 없어 엔티티는 id 만 든다(Warehouse.process_id 와 같다). FK 는 DB 가 지킨다.
CREATE TABLE item_production_processes (
    item_id    bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    process_id bigint NOT NULL REFERENCES production_processes(id),
    PRIMARY KEY (item_id, process_id)
);
CREATE INDEX idx_item_production_processes_process ON item_production_processes (process_id);
