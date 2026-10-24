package com.erp.common.usage;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 원본 [미사용코드조회](재고1 거래처 · 프로젝트 · 품목 · 관리항목 리스트) — 기준일자 기간 안에 전표에 한 번도 쓰이지 않은 코드를 찾는다.
 *
 * <p>common 은 다른 모듈을 모른다(CLAUDE.md 4.1). 그래서 모듈 service 를 부르지 않고, DB 가 강제하는 마스터를 가리키는 FK 를
 * 카탈로그에서 읽어 그 표(또는 줄 표라면 머리 표)의 전표일자가 기간 안인 행을 센다. 새 표가 FK 를 달면 자동으로 잡힌다.
 * 일자 칸이 없는 표(재고 잔량 · 마스터끼리의 참조)는 '전표 쓰임' 이 아니라 세지 않는다.
 * 각 마스터 모듈이 자기 service 로 이 도구를 불러 자기 API 로 연다.
 */
@Component
public class UnusedCodeFinder {

    /** 전표일자로 보는 칸 이름, 앞에 있을수록 우선 */
    private static final List<String> DATE_COLUMNS = List.of(
            "sale_date", "purchase_date", "order_date", "quote_date", "ship_date", "adjust_date", "transfer_date",
            "stocktake_date", "production_date", "issue_date", "voucher_date", "entry_date", "txn_date", "settle_date",
            "request_date", "inspection_date", "plan_date", "repair_date", "receipt_date", "report_date", "expense_date",
            "draft_date", "event_date", "tx_date", "work_date", "transaction_date", "invoice_date", "pay_date",
            "activity_date", "contract_date", "start_date", "run_date");

    @PersistenceContext
    private EntityManager em;

    /** table 의 id 중 [from, to] 안의 전표에 안 쓰인 것 */
    @SuppressWarnings("unchecked")
    public List<Long> unusedIds(String table, LocalDate from, LocalDate to) {
        Set<Long> used = usedIds(table, from, to);
        List<Number> all = em.createNativeQuery("select id from \"" + table + "\" order by id").getResultList();
        List<Long> out = new ArrayList<>();
        for (Number n : all) if (!used.contains(n.longValue())) out.add(n.longValue());
        return out;
    }

    /**
     * table 이 전표에 직접 쓰이지 않고 다른 마스터({@code via}) 를 통해 쓰일 때(관리항목 ← 품목): via 중 기간 안 전표에 쓰인 행이
     * {@code viaColumn} 으로 가리키는 table 행을 '쓴 것' 으로 본다.
     */
    @SuppressWarnings("unchecked")
    public List<Long> unusedIdsVia(String table, String via, String viaColumn, LocalDate from, LocalDate to) {
        Set<Long> usedVia = usedIds(via, from, to);
        Set<Long> used = new LinkedHashSet<>();
        if (!usedVia.isEmpty()) {
            List<Number> ids = em.createNativeQuery("select distinct \"" + viaColumn + "\" from \"" + via
                    + "\" where \"" + viaColumn + "\" is not null and id in (:ids)").setParameter("ids", usedVia).getResultList();
            for (Number n : ids) used.add(n.longValue());
        }
        List<Number> all = em.createNativeQuery("select id from \"" + table + "\" order by id").getResultList();
        List<Long> out = new ArrayList<>();
        for (Number n : all) if (!used.contains(n.longValue())) out.add(n.longValue());
        return out;
    }

    @SuppressWarnings("unchecked")
    private Set<Long> usedIds(String table, LocalDate from, LocalDate to) {
        List<Object[]> fks = em.createNativeQuery("""
                select cl.relname, a.attname
                  from pg_constraint c
                  join pg_class cl on cl.oid = c.conrelid
                  join pg_namespace n on n.oid = cl.relnamespace
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                 where c.contype = 'f' and c.confrelid = to_regclass(:t) and n.nspname = current_schema()
                   and cl.relname <> :t
                 order by 1, 2""").setParameter("t", table).getResultList();
        Set<Long> used = new LinkedHashSet<>();
        for (Object[] fk : fks) {
            String child = (String) fk[0];
            String column = (String) fk[1];
            String from1 = "\"" + child + "\" c";
            String dateExpr = dateColumn(child) == null ? null : "c.\"" + dateColumn(child) + "\"";
            if (dateExpr == null) {
                // 줄 표 — 머리 표(FK 로 연결)의 일자를 쓴다
                List<Object[]> parents = em.createNativeQuery("""
                        select a.attname, cf.relname
                          from pg_constraint c
                          join pg_class cl on cl.oid = c.conrelid
                          join pg_class cf on cf.oid = c.confrelid
                          join pg_namespace n on n.oid = cl.relnamespace
                          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                         where c.contype = 'f' and cl.relname = :c and n.nspname = current_schema()
                           and cf.relname <> :t and cf.relname <> :c
                         order by 1""").setParameter("c", child).setParameter("t", table).getResultList();
                for (Object[] p : parents) {
                    String pdate = dateColumn((String) p[1]);
                    if (pdate == null) continue;
                    from1 = "\"" + child + "\" c join \"" + p[1] + "\" h on h.id = c.\"" + p[0] + "\"";
                    dateExpr = "h.\"" + pdate + "\"";
                    break;
                }
            }
            if (dateExpr == null) continue;
            List<Number> ids = em.createNativeQuery("select distinct c.\"" + column + "\" from " + from1
                            + " where c.\"" + column + "\" is not null and " + dateExpr + " between :f and :t")
                    .setParameter("f", from).setParameter("t", to).getResultList();
            for (Number id : ids) used.add(id.longValue());
        }
        return used;
    }

    @SuppressWarnings("unchecked")
    private String dateColumn(String table) {
        List<String> cols = em.createNativeQuery("""
                select column_name from information_schema.columns
                 where table_schema = current_schema() and table_name = :t and data_type = 'date'""")
                .setParameter("t", table).getResultList();
        for (String d : DATE_COLUMNS) if (cols.contains(d)) return d;
        return null;
    }
}
