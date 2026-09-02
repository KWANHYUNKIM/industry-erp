-- 수집데이터등록의 [데이터코드]·[최초작성일자]·[최종작업일자]가 아홉 줄 모두 비어 있었다.
--
-- V188 이 "최초작성일자·최종작업일자는 마이그레이션이 필요 없다 — BaseTimeEntity 를
-- 상속해 이미 들고 있다" 고 적었는데, 그 말은 <b>앞으로 만들 줄</b>에만 맞는다.
-- V117 이 시드 아홉 줄을 SQL INSERT 로 넣었기 때문에 JPA 의 @CreatedDate 가 돈 적이 없고,
-- created_at·updated_at 이 NULL 로 남았다. 화면은 그 두 열을 늘 빈 칸으로 그린다.
-- code 도 같은 까닭으로 아홉 줄 다 비어 있어, [데이터코드]로는 아무것도 못 찾는다.
--
-- 만들어진 시각은 지어내지 않는다. 이 아홉 줄은 V117 이 들어온 그때 생긴 것이므로
-- 그 커밋 시각(2026-07-27 16:39:10 +09:00)을 쓴다.
--
-- 코드는 V188 이 하려던 일을 마저 한다 — "다른 마스터처럼 코드로도 부를 수 있게 한다".
-- 사람이 나중에 바꾼 값은 건드리지 않도록 비어 있는 줄만 채운다.

UPDATE collect_sources SET created_at = timestamp '2026-07-27 16:39:10'
 WHERE created_at IS NULL;
UPDATE collect_sources SET updated_at = created_at
 WHERE updated_at IS NULL;

UPDATE collect_sources SET code = 'ITEM'       WHERE code IS NULL AND endpoint = '/items';
UPDATE collect_sources SET code = 'PARTNER'    WHERE code IS NULL AND endpoint = '/partners';
UPDATE collect_sources SET code = 'WAREHOUSE'  WHERE code IS NULL AND endpoint = '/warehouses';
UPDATE collect_sources SET code = 'STOCK'      WHERE code IS NULL AND endpoint = '/stock';
UPDATE collect_sources SET code = 'STOCK_TXN'  WHERE code IS NULL AND endpoint like '/stock/transactions%';
UPDATE collect_sources SET code = 'SALES'      WHERE code IS NULL AND endpoint = '/sales';
UPDATE collect_sources SET code = 'PURCHASE'   WHERE code IS NULL AND endpoint = '/purchases';
UPDATE collect_sources SET code = 'WORK_ORDER' WHERE code IS NULL AND endpoint = '/work-orders';
UPDATE collect_sources SET code = 'PRODUCTION' WHERE code IS NULL AND endpoint = '/productions';
