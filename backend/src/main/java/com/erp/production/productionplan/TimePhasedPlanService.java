package com.erp.production.productionplan;

import com.erp.common.ApiException;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.item.dto.ItemDtos.ItemResponse;
import com.erp.inventory.stock.StockService;
import com.erp.production.bom.Bom;
import com.erp.production.bom.BomRepository;
import com.erp.production.productionplan.dto.TimePhasedDtos.Cell;
import com.erp.production.productionplan.dto.TimePhasedDtos.Result;
import com.erp.production.productionplan.dto.TimePhasedDtos.Row;
import com.erp.production.workorder.WorkOrder;
import com.erp.production.workorder.WorkOrderRepository;
import com.erp.production.workorder.WorkOrderStatus;
import com.erp.trade.purchaseorder.PurchaseOrderService;
import com.erp.trade.purchaseorder.PurchaseOrderStatus;
import com.erp.trade.salesorder.SalesOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 원본 생산계획/MRP생성의 <b>생산계획계산 · MRP계산</b>과 그 현황 — 날짜별 순소요(netting) 표.
 *
 * <p>품목마다 전일재고에서 시작해 날마다
 * <pre>
 *   예상재고 = 기초재고 + 입고예정 + 생산예정 + 계획수량 − 출고예정 − 소모예정
 * </pre>
 * 를 굴린다. 계획 없이 굴린 값이 안전재고 밑으로 내려가면 그만큼이 <b>필요수량</b>이고, 최소증가단위로 올려
 * 같은 날에 <b>계획수량</b>을 세운다(원본 열: 안전재고수량 · 최소증가단위 · 조달기간 · 전일재고).
 *
 * <ul>
 *   <li>입고예정 — 발주확정(ORDERED)된 발주 줄, 납기일(없으면 발주일)에.</li>
 *   <li>생산예정 — 끝나지 않은 작업지시의 잔량, 납기일(없으면 지시일)에.</li>
 *   <li>출고예정 — 미판매 주문 줄의 잔량, 납기일(없으면 주문일)에(원본 생산계획대상 [미판매]).</li>
 *   <li>소모예정 — 위 품목을 만드는 데 드는 자재: 열린 작업지시 잔량 × BOM, 그리고 이 표가 세운 상위 품목의
 *       계획수량 × BOM. 그래서 BOM 위에서 아래로(제품 → 반제품 → 원재료) 차례로 센다.</li>
 * </ul>
 * 기간 전에 잡혀 있었는데 안 끝난 것은 [계획기간이전] 한 칸에 모으고 첫날 기초재고에 얹는다(원본도 그렇다:
 * 전일재고와 첫날 기초재고가 다르다). BOM 이 있는 품목은 생산계획 쪽, 없는 품목(자재)은 MRP 쪽이다.
 *
 * <p>계획수량은 <b>필요한 날</b>(받는 날)에 선다. 조달기간만큼 앞당기는 것은 문서를 낼 때다 — 화면이
 * 작업지시서·발주요청을 만들 때 지시일·발주일 = 필요일 − 조달기간, 납기일 = 필요일로 둔다(MRP 의 계획입고 · 계획발주).
 */
@Service
@RequiredArgsConstructor
public class TimePhasedPlanService {

    private static final int MAX_DAYS = 92;

    private final BomRepository bomRepository;
    private final WorkOrderRepository workOrderRepository;
    /* 다른 모듈은 service 로(CLAUDE.md 4.2). production → inventory · trade 는 허용된 방향이다. */
    private final ItemService itemService;
    private final StockService stockService;
    private final SalesOrderService salesOrderService;
    private final PurchaseOrderService purchaseOrderService;

    @Transactional(readOnly = true)
    public Result compute(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) throw ApiException.badRequest("생산계획기간을 바르게 정하세요.");
        long n = ChronoUnit.DAYS.between(from, to) + 1;
        if (n > MAX_DAYS) throw ApiException.badRequest("생산계획기간은 " + MAX_DAYS + "일까지 볼 수 있습니다.");
        List<LocalDate> days = new ArrayList<>();
        for (int i = 0; i < n; i++) days.add(from.plusDays(i));

        // BOM — 부모 → [자식, 개당 소요량]
        Map<Long, List<Map.Entry<Long, BigDecimal>>> bom = new HashMap<>();
        for (Bom b : bomRepository.findAllWithProduct()) {
            List<Map.Entry<Long, BigDecimal>> lines = new ArrayList<>();
            b.getLines().forEach(l -> lines.add(Map.entry(l.getComponent().getId(), l.getQuantity())));
            bom.put(b.getProduct().getId(), lines);
        }

        // 날짜별 사건(품목 → 날짜 → 양). 기간 전은 from.minusDays(1) 하나로 모은다.
        Map<Long, Map<LocalDate, BigDecimal>> in = new HashMap<>(), prod = new HashMap<>(), out = new HashMap<>(),
                consume = new HashMap<>();
        LocalDate before = from.minusDays(1);

        purchaseOrderService.findByStatus(PurchaseOrderStatus.ORDERED).forEach(po -> {
            LocalDate d = po.dueDate() != null ? po.dueDate() : po.orderDate();
            po.lines().forEach(l -> add(in, l.itemId(), clamp(d, before, to), l.quantity()));
        });
        salesOrderService.findUnsold().forEach(u -> {
            LocalDate d = u.dueDate() != null ? u.dueDate() : u.orderDate();
            if (u.unsoldQty() != null && u.unsoldQty().signum() > 0) add(out, u.itemId(), clamp(d, before, to), u.unsoldQty());
        });
        for (WorkOrder wo : workOrderRepository.findAllWithRefs()) {
            if (wo.getStatus() == WorkOrderStatus.COMPLETED) continue;
            BigDecimal rest = wo.getPlannedQty().subtract(wo.getProducedQty());
            if (rest.signum() <= 0) continue;
            LocalDate d = clamp(wo.getDueDate() != null ? wo.getDueDate() : wo.getOrderDate(), before, to);
            add(prod, wo.getProduct().getId(), d, rest);
            // 작업지시가 쓸 자재는 지시일에 빠진다고 본다.
            LocalDate cd = clamp(wo.getOrderDate(), before, to);
            for (var c : bom.getOrDefault(wo.getProduct().getId(), List.of())) add(consume, c.getKey(), cd, c.getValue().multiply(rest));
        }

        // 전일재고 — 기간 첫날 전날(전 창고 합).
        Map<Long, BigDecimal> stock = new HashMap<>();
        stockService.stockAsOf(before).forEach(s -> stock.merge(s.itemId(), s.quantity(), BigDecimal::add));

        Map<Long, ItemResponse> items = new HashMap<>();
        itemService.findAll().forEach(i -> items.put(i.id(), i));

        // 보일 품목 — 무언가 움직이거나, BOM 에 나오거나, 안전재고가 있는 것.
        Set<Long> ids = new LinkedHashSet<>();
        ids.addAll(bom.keySet());
        bom.values().forEach(ls -> ls.forEach(e -> ids.add(e.getKey())));
        ids.addAll(in.keySet()); ids.addAll(out.keySet()); ids.addAll(prod.keySet());
        ids.removeIf(id -> items.get(id) == null || !items.get(id).active());

        // BOM 위 → 아래 차례(부모를 먼저 세야 자식의 소모예정이 다 모인다).
        List<Long> order = topDown(ids, bom);

        Map<Long, Row> rows = new LinkedHashMap<>();
        for (Long id : order) {
            ItemResponse it = items.get(id);
            boolean producible = bom.containsKey(id);
            BigDecimal safety = nz(it.safetyStock());
            BigDecimal minUnit = nz(it.minPurchaseUnit());
            BigDecimal prev = stock.getOrDefault(id, BigDecimal.ZERO);

            Cell beforeCell = new Cell(null, get(in, id, before), get(prod, id, before), get(out, id, before),
                    get(consume, id, before), null, null, null);
            BigDecimal opening = prev.add(beforeCell.inQty()).add(beforeCell.prodQty())
                    .subtract(beforeCell.outQty()).subtract(beforeCell.consumeQty());

            List<Cell> cells = new ArrayList<>();
            for (LocalDate d : days) {
                BigDecimal i = get(in, id, d), p = get(prod, id, d), o = get(out, id, d), c = get(consume, id, d);
                BigDecimal without = opening.add(i).add(p).subtract(o).subtract(c);
                BigDecimal need = without.compareTo(safety) < 0 ? safety.subtract(without) : BigDecimal.ZERO;
                BigDecimal plan = roundUp(need, minUnit);
                BigDecimal expected = without.add(plan);
                cells.add(new Cell(opening, i, p, o, c, expected, need, plan));
                // 계획한 만큼 만들려면 그날 자재가 빠진다 — 자식의 소모예정으로 넘긴다.
                if (plan.signum() > 0 && producible) {
                    for (var e : bom.get(id)) add(consume, e.getKey(), d, e.getValue().multiply(plan));
                }
                opening = expected;
            }
            rows.put(id, new Row(id, it.code(), it.name(), it.spec(), it.unit(), producible,
                    safety, minUnit, it.leadTimeDays(), it.supplierId(), prev, beforeCell, cells));
        }
        // 화면은 코드 차례로 본다(계산 차례는 BOM 위→아래였다).
        List<Row> sorted = new ArrayList<>(rows.values());
        sorted.sort(Comparator.comparing(Row::itemCode, Comparator.nullsLast(String::compareTo)));
        return new Result(from, to, days, sorted);
    }

    /** 부모를 자식보다 먼저 — 순환이 있으면 남은 것은 그냥 뒤에 붙인다(BOM 저장이 이미 순환을 막는다). */
    private static List<Long> topDown(Set<Long> ids, Map<Long, List<Map.Entry<Long, BigDecimal>>> bom) {
        Map<Long, Integer> parents = new HashMap<>();
        ids.forEach(id -> parents.put(id, 0));
        bom.forEach((p, ls) -> { if (ids.contains(p)) ls.forEach(e -> parents.computeIfPresent(e.getKey(), (k, v) -> v + 1)); });
        Deque<Long> ready = new ArrayDeque<>();
        parents.forEach((k, v) -> { if (v == 0) ready.add(k); });
        List<Long> out = new ArrayList<>();
        Set<Long> done = new HashSet<>();
        while (!ready.isEmpty()) {
            Long id = ready.poll();
            if (!done.add(id)) continue;
            out.add(id);
            for (var e : bom.getOrDefault(id, List.of())) {
                if (parents.computeIfPresent(e.getKey(), (k, v) -> v - 1) != null && parents.get(e.getKey()) == 0) ready.add(e.getKey());
            }
        }
        ids.stream().filter(id -> !done.contains(id)).forEach(out::add);
        return out;
    }

    private static LocalDate clamp(LocalDate d, LocalDate before, LocalDate to) {
        if (d == null || d.isBefore(before.plusDays(1))) return before;
        return d.isAfter(to) ? to.plusDays(1) : d;   // 기간 뒤는 표에 안 나온다(to+1 칸은 없다)
    }

    private static void add(Map<Long, Map<LocalDate, BigDecimal>> m, Long item, LocalDate d, BigDecimal q) {
        if (q == null || q.signum() == 0) return;
        m.computeIfAbsent(item, k -> new HashMap<>()).merge(d, q, BigDecimal::add);
    }

    private static BigDecimal get(Map<Long, Map<LocalDate, BigDecimal>> m, Long item, LocalDate d) {
        return m.getOrDefault(item, Map.of()).getOrDefault(d, BigDecimal.ZERO);
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }

    /** 최소증가단위로 올린다(0 이면 그대로). */
    private static BigDecimal roundUp(BigDecimal need, BigDecimal unit) {
        if (need.signum() <= 0) return BigDecimal.ZERO;
        if (unit.signum() <= 0) return need;
        return need.divide(unit, 0, RoundingMode.CEILING).multiply(unit);
    }
}
