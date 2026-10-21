package com.erp.inventory.item;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 품목을 쓰고 있는 자료(전표 · 마스터)를 찾는다 — 원본 품목등록 [삭제] 의 '삭제불가코드' 창 '자료' 열(C000029, 2026-10-21 실측).
 *
 * <p>inventory 는 기반층이라 판매 · 구매 · 생산 모듈을 참조할 수 없다(CLAUDE.md 4.1). 그래서 각 모듈의 service 를 부르지 않고,
 * DB 가 강제하는 {@code items} 를 가리키는 FK 를 카탈로그에서 읽어 그 표에 줄이 있는지만 본다. 새 표가 품목 FK 를 달면 자동으로 막힌다.
 * 네이티브 쿼리라 세션 커넥션(회사 스키마의 search_path)을 그대로 탄다 — JdbcTemplate 은 테넌트 라우팅을 건너뛴다.
 */
@Repository
public class ItemUsageRepository {

    @PersistenceContext
    private EntityManager em;

    /** 표 → 원본 메뉴 이름(자료 열). 여기 없는 표는 '기타'. */
    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("sales_lines", "판매"),
            Map.entry("purchase_lines", "구매"),
            Map.entry("sales_order_lines", "주문서"),
            Map.entry("quotation_lines", "견적서"),
            Map.entry("purchase_order_lines", "발주서"),
            Map.entry("shipment_lines", "출하"),
            Map.entry("shipment_order_lines", "출하지시서"),
            Map.entry("export_order_lines", "수출"),
            Map.entry("stock_adjustments", "재고조정"),
            Map.entry("staged_stock_adjustments", "재고조정"),
            Map.entry("stock_transfers", "창고이동"),
            Map.entry("stocktakes", "재고실사"),
            Map.entry("boms", "BOM"),
            Map.entry("bom_lines", "BOM"),
            Map.entry("work_orders", "작업지시서"),
            Map.entry("productions", "생산입고"),
            Map.entry("production_materials", "생산입고"),
            Map.entry("material_issues", "생산불출"),
            Map.entry("production_plans", "생산계획"),
            Map.entry("sales_plans", "판매계획"),
            Map.entry("special_prices", "특별단가"),
            Map.entry("quality_inspections", "품질검사"),
            Map.entry("quality_inspection_lines", "품질검사"),
            Map.entry("quality_inspection_requests", "품질검사요청"),
            Map.entry("quality_inspection_request_lines", "품질검사요청"),
            Map.entry("as_requests", "A/S"),
            Map.entry("as_request_lines", "A/S"),
            Map.entry("as_repair_lines", "A/S"),
            Map.entry("as_parts", "A/S"),
            Map.entry("lots", "시리얼/로트"),
            Map.entry("items", "다규격품목"));

    /** 재고 잔량 표 — 전표가 없을 때만 '재고' 로 보인다(전표가 있으면 그 전표 이름이 대신한다). */
    private static final Set<String> STOCK_TABLES = Set.of("stocks", "location_stocks", "stock_lots", "stock_transactions");

    /** 품목 id → 쓰는 자료 이름들(원본 메뉴 이름, 겹치지 않게). 아무 데도 안 쓰면 맵에 없다. */
    @SuppressWarnings("unchecked")
    public Map<Long, Set<String>> findUsages(List<Long> itemIds) {
        Map<Long, Set<String>> out = new LinkedHashMap<>();
        if (itemIds.isEmpty()) return out;
        List<Object[]> fks = em.createNativeQuery("""
                select cl.relname, a.attname
                  from pg_constraint c
                  join pg_class cl on cl.oid = c.conrelid
                  join pg_namespace n on n.oid = cl.relnamespace
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                 where c.contype = 'f' and c.confrelid = to_regclass('items') and n.nspname = current_schema()
                 order by 1, 2""").getResultList();
        Map<Long, Set<String>> stockOnly = new LinkedHashMap<>();
        for (Object[] fk : fks) {
            String table = (String) fk[0];
            String column = (String) fk[1];
            if (table.equals("items") && !column.equals("parent_item_id")) continue;
            boolean stock = STOCK_TABLES.contains(table);
            String sql = "select distinct \"" + column + "\" from \"" + table + "\" where \"" + column + "\" in (:ids)";
            if (table.equals("stock_transactions")) {
                // 판매 · 구매가 만든 입출고는 그 전표 이름으로 이미 잡힌다. 조정만 따로 '재고조정'.
                List<Number> adj = em.createNativeQuery(sql + " and type = 'ADJUST'").setParameter("ids", itemIds).getResultList();
                adj.forEach(id -> out.computeIfAbsent(id.longValue(), k -> new LinkedHashSet<>()).add("재고조정"));
            }
            List<Number> used = em.createNativeQuery(sql).setParameter("ids", itemIds).getResultList();
            for (Number id : used) {
                if (stock) stockOnly.computeIfAbsent(id.longValue(), k -> new LinkedHashSet<>()).add("재고");
                else out.computeIfAbsent(id.longValue(), k -> new LinkedHashSet<>()).add(LABELS.getOrDefault(table, "기타"));
            }
        }
        stockOnly.forEach((id, labels) -> out.computeIfAbsent(id, k -> new LinkedHashSet<>(labels)));
        return out;
    }
}
