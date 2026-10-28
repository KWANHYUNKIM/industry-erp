package com.erp.trade.orderrelease;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.orderrelease.dto.OrderReleaseDtos.*;
import com.erp.trade.sales.SalesRepository;
import com.erp.trade.salesorder.SalesOrder;
import com.erp.trade.salesorder.SalesOrderLine;
import com.erp.trade.salesorder.SalesOrderLineRepository;
import com.erp.trade.salesorder.SalesOrderRepository;
import com.erp.trade.salesorder.SalesOrderStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 주문서출고처리(원본 E040230). 2026-10-13 loginaa 실측:
 * <ul>
 *   <li>미처리 탭: 주문 줄마다 잔량 = 주문수량 − 출고처리 수량. 체크하면 [출고수량]이 잔량으로 찬다.</li>
 *   <li>[출고] → '출고등록' 창(일자 · 처리구분 '처리') [저장(F8)] — 안내 없이 닫히고 잔량이 준다(7 → 4).</li>
 *   <li>처리 탭: 출고 일자-No. · 주문 일자-No. · 거래처명 · 품목 · 출고수량합계 · 판매('입력' → 판매입력, 저장하면 판매 일자-No.) · 인쇄.</li>
 *   <li>[처리취소]: 판매가 있으면 '이미 판매입력된 전표가 있습니다. 진행하겠습니까?' — 확인하면 처리만 지운다.
 *       판매는 남고 주문 잔량은 다시 7 이 된다(판매 수량과 따로 센다).</li>
 * </ul>
 * 재고 · 회계는 출고처리로는 움직이지 않는다.
 */
@Service
@RequiredArgsConstructor
public class OrderReleaseService {

    /** 취소된 주문만 뺀다. 완료(전부 판매)된 주문도 출고처리 잔량은 따로 센다. */
    private static final List<SalesOrderStatus> OPEN = List.of(
            SalesOrderStatus.RECEIVED, SalesOrderStatus.IN_PROGRESS, SalesOrderStatus.COMPLETED);

    private final OrderReleaseRepository releaseRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final SalesOrderLineRepository salesOrderLineRepository;
    private final SalesRepository salesRepository;
    private final DocumentNoGenerator docNoGenerator;

    /** 미처리 탭 — 기준일자(주문일) 기간의 주문 줄 중 잔량이 남은 것. 최근 주문이 위. */
    @Transactional(readOnly = true)
    public List<PendingLine> pending(LocalDate from, LocalDate to) {
        List<SalesOrder> orders = salesOrderRepository.findByStatusesWithLinesInPeriod(OPEN,
                from != null ? from : LocalDate.of(1, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
        List<Long> lineIds = orders.stream().flatMap(o -> o.getLines().stream()).map(SalesOrderLine::getId).toList();
        Map<Long, BigDecimal> released = releasedByLine(lineIds);
        return orders.stream()
                .sorted(Comparator.comparing(SalesOrder::getOrderDate).reversed()
                        .thenComparing(SalesOrder::getOrderNo, Comparator.reverseOrder()))
                .flatMap(o -> o.getLines().stream().map(l -> {
                    BigDecimal done = released.getOrDefault(l.getId(), BigDecimal.ZERO);
                    BigDecimal rest = l.getQuantity().subtract(done);
                    return new PendingLine(o.getId(), o.getOrderNo(), o.getOrderDate(), l.getId(),
                            o.getPartner().getId(), o.getPartner().getName(),
                            o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                            o.getProject() != null ? o.getProject().getId() : null,
                            l.getItem().getId(), l.getItem().getCode(), l.effectiveItemName(), l.effectiveSpec(),
                            l.getQuantity(), done, rest, o.getDueDate(), o.getRemark(), o.getUpdatedAt());
                }))
                .filter(p -> p.remainQty().signum() > 0)
                .toList();
    }

    /** 처리 탭 — 출고일자 기간. */
    @Transactional(readOnly = true)
    public List<ReleaseRow> list(LocalDate from, LocalDate to) {
        return releaseRepository.findInPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31))
                .stream().map(this::toRow).toList();
    }

    @Transactional(readOnly = true)
    public ReleaseDetail detail(Long id) {
        OrderRelease r = find(id);
        SalesOrder o = r.getSalesOrder();
        Map<Long, BigDecimal> released = releasedByLine(
                r.getLines().stream().map(l -> l.getSalesOrderLine().getId()).toList());
        boolean taxable = o.getVatAmount().signum() > 0 || o.getSupplyAmount().signum() == 0;
        return new ReleaseDetail(r.getId(), r.getReleaseNo(), r.getReleaseDate(),
                o.getId(), o.getOrderNo(), o.getOrderDate(), o.getPartner().getId(),
                o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                o.getProject() != null ? o.getProject().getId() : null,
                o.getEmployee() != null ? o.getEmployee().getId() : null,
                taxable, r.getSale() != null ? r.getSale().getId() : null,
                r.getLines().stream().map(l -> {
                    SalesOrderLine ol = l.getSalesOrderLine();
                    // [추가수량] = 주문수량 − 다른 처리 건이 낸 수량(이 건을 빼고 낼 수 있는 만큼).
                    BigDecimal others = released.getOrDefault(ol.getId(), BigDecimal.ZERO).subtract(l.getQuantity());
                    return new DetailLine(ol.getItem().getId(), l.getQuantity(), ol.getUnitPrice(),
                            ol.getItem().getCode(), ol.effectiveItemName(),
                            l.getId(), ol.effectiveSpec(), ol.getQuantity().subtract(others));
                }).toList(),
                o.getPartner().getName(), o.getWarehouse() != null ? o.getWarehouse().getName() : null);
    }

    /**
     * '출고등록' [저장(F8)]. 고른 줄을 주문마다 한 건으로 묶는다
     * (원본은 한 주문 한 줄로만 재 봤다 — 여러 주문을 한 번에 고르면 어떻게 묶는지는 아직 안 쟀다).
     */
    @Transactional
    public List<ReleaseRow> create(CreateReleaseRequest req, String username) {
        Map<Long, BigDecimal> qtyByLine = new LinkedHashMap<>();
        req.lines().forEach(l -> qtyByLine.merge(l.orderLineId(), l.quantity(), BigDecimal::add));
        List<SalesOrderLine> lines = salesOrderLineRepository.findWithOrderByIds(qtyByLine.keySet());
        if (lines.size() != qtyByLine.size()) throw ApiException.notFound("주문서를 찾을 수 없습니다.");
        /*
         * 잔량보다 많이 내보내도 막지 않는다 — 원본에서 잔량 10 인 줄에 15 를 넣고 [저장(F8)] 하니 안내 없이 저장되고
         * 그 줄이 미처리에서 사라졌다(2026-10-13 셋째 실측). 잔량이 0 이하가 되면 미처리에서 빠질 뿐이다.
         */
        /*
         * 주문마다 한 건씩, <b>화면에 보이던 차례대로</b> 번호를 매긴다 — 원본에서 -6 · -5 두 주문을 함께 출고하면
         * 목록 위의 -6 이 출고 -1, -5 가 -2 가 됐다(2026-10-13 실측). 조회 결과의 차례는 정해져 있지 않아 요청 차례로 맞춘다.
         */
        List<Long> askOrder = new ArrayList<>(qtyByLine.keySet());
        lines = new ArrayList<>(lines);
        lines.sort(Comparator.comparingInt(l -> askOrder.indexOf(l.getId())));
        Map<SalesOrder, List<SalesOrderLine>> byOrder = lines.stream()
                .collect(Collectors.groupingBy(SalesOrderLine::getSalesOrder, LinkedHashMap::new, Collectors.toList()));
        List<ReleaseRow> made = new ArrayList<>();
        for (var e : byOrder.entrySet()) {
            OrderRelease r = OrderRelease.builder()
                    .releaseNo(docNoGenerator.next("OR-", "order_releases", "release_no", "release_date", req.releaseDate()))
                    .releaseDate(req.releaseDate())
                    .salesOrder(e.getKey())
                    .createdBy(username)
                    .build();
            e.getValue().forEach(l -> r.getLines().add(OrderReleaseLine.builder()
                    .release(r).salesOrderLine(l).quantity(qtyByLine.get(l.getId())).build()));
            made.add(toRow(releaseRepository.save(r)));
        }
        return made;
    }

    /**
     * '주문서출고처리수정' [저장(F8)] — 줄마다 [수량] 을 고친다. 0 도 받는다: 원본에서 0 으로 저장하니 안내 없이 저장되고
     * 처리 건은 남은 채 [출고수량합계] 가 빈칸이 됐다. 15 → 4 로 고치면 미처리 잔량이 10 − 4 = 6 이 됐다(2026-10-13 실측).
     */
    @Transactional
    public ReleaseRow update(Long id, UpdateReleaseRequest req) {
        OrderRelease r = find(id);
        Map<Long, BigDecimal> qty = new HashMap<>();
        req.lines().forEach(l -> qty.put(l.lineId(), l.quantity()));
        r.getLines().forEach(l -> { BigDecimal q = qty.get(l.getId()); if (q != null) l.setQuantity(q); });
        return toRow(r);
    }

    /** [처리취소] — 처리만 지운다. 이 건으로 만든 판매는 남는다(원본 그대로). */
    @Transactional
    public void delete(Long id) {
        releaseRepository.delete(find(id));
    }

    /** 처리 탭 [판매] '입력' 으로 저장한 판매를 건다. */
    @Transactional
    public ReleaseRow linkSale(Long id, Long saleId) {
        OrderRelease r = find(id);
        r.setSale(salesRepository.findById(saleId)
                .orElseThrow(() -> ApiException.notFound("판매 전표를 찾을 수 없습니다. id=" + saleId)));
        return toRow(r);
    }

    private OrderRelease find(Long id) {
        return releaseRepository.findWithOrder(id)
                .orElseThrow(() -> ApiException.notFound("출고처리를 찾을 수 없습니다. id=" + id));
    }

    private Map<Long, BigDecimal> releasedByLine(Collection<Long> lineIds) {
        if (lineIds.isEmpty()) return Map.of();
        Map<Long, BigDecimal> m = new HashMap<>();
        for (Object[] row : releaseRepository.sumReleasedByLine(lineIds)) m.put((Long) row[0], (BigDecimal) row[1]);
        return m;
    }

    /** 품목 칸은 원본처럼 '품목명[규격]', 줄이 여럿이면 '… 외 n건'. */
    private ReleaseRow toRow(OrderRelease r) {
        SalesOrder o = r.getSalesOrder();
        List<OrderReleaseLine> ls = r.getLines();
        String first = ls.isEmpty() ? "" : itemLabel(ls.get(0).getSalesOrderLine());
        String summary = ls.size() > 1 ? first + " 외 " + (ls.size() - 1) + "건" : first;
        BigDecimal total = ls.stream().map(OrderReleaseLine::getQuantity).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ReleaseRow(r.getId(), r.getReleaseNo(), r.getReleaseDate(), o.getId(), o.getOrderNo(), o.getOrderDate(),
                o.getPartner().getName(), summary, total,
                r.getSale() != null ? r.getSale().getId() : null,
                r.getSale() != null ? r.getSale().getDocNo() : null,
                r.getSale() != null ? r.getSale().getSaleDate() : null);
    }

    private static String itemLabel(SalesOrderLine l) {
        String spec = l.effectiveSpec();
        return l.effectiveItemName() + (spec == null || spec.isBlank() ? "" : "[" + spec + "]");
    }
}
