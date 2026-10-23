package com.erp.trade.purchaseorder;

import com.erp.trade.VatAllocator;
import com.erp.trade.TradeMasters;
import com.erp.trade.purchase.PurchaseService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.hr.employee.Employee;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.trade.purchase.dto.PurchaseDtos.CreatePurchaseRequest;
import com.erp.trade.purchase.dto.PurchaseDtos.PurchaseLineRequest;
import com.erp.trade.purchase.dto.PurchaseDtos.PurchaseResponse;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.ApplyPricesRequest;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.CreatePurchaseOrderRequest;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.LinePriceRequest;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.OrderLineRequest;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.PlanLineRequest;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.PlanRequest;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.PurchaseOrderResponse;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.ReceiveRequest;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.hr.employee.EmployeeRepository;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.trade.purchase.PurchaseLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import com.erp.trade.purchase.dto.PurchaseDtos;
import com.erp.trade.purchaseorder.dto.PurchaseOrderDtos;

/**
 * 발주서: 발주요청 → 발주계획 → 단가확정 → 발주확정 → 구매입고 전환.
 * 재고는 구매전표(Purchase)로 전환될 때만 움직인다. 발주 자체는 재고를 건드리지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PurchaseOrderService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final PurchaseOrderRepository orderRepository;
    private final com.erp.trade.purchaseorder.PurchaseOrderHistoryRepository historyRepository;
    /* 다른 모듈의 값은 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final ProjectService projectService;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    private final EmployeeRepository employeeRepository;
    private final WarehouseService warehouseService;
    private final PurchaseService purchaseService;
    private final PurchaseLineRepository purchaseLineRepository;
    private final PurchaseOrderLineRepository orderLineRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.common.history.ChangeHistoryService changeHistory;

    public static final String HISTORY_TARGET = "PURCHASE_ORDER";

    /**
     * 거래이력조회(재고) — 발주서 한 엔티티가 상태로 세 메뉴다(원본 메뉴검색 '발주요청' · '단가요청' · '발주서').
     * 발주요청 → 발주요청, 단가요청 · 단가확정 → 단가요청, 발주계획 · 발주확정 · 입고전환 · 취소 → 발주서.
     * (발주계획은 원본 메뉴검색에 없음 — 어느 메뉴에 묶이는지 원본 재기 필요.)
     */
    private void recordHistory(PurchaseOrder po, String action, PurchaseOrderStatus status) {
        String menu = switch (status) {
            case REQUESTED -> "발주요청";
            case PRICE_REQUESTED, PRICED -> "단가요청";
            default -> "발주서";
        };
        PurchaseOrderLine first = po.getLines().isEmpty() ? null : po.getLines().get(0);
        changeHistory.recordSlip(HISTORY_TARGET, po.getId(), action, new com.erp.common.history.ChangeHistoryService.SlipSnapshot(menu, po.getOrderDate(), po.getOrderNo(),
                po.getPartner() != null ? po.getPartner().getCode() : null,
                po.getPartner() != null ? po.getPartner().getName() : null,
                first == null ? null : com.erp.common.history.ChangeHistoryService.itemSummary(first.getItem().getName(), first.getItem().getSpec(), po.getLines().size()),
                po.getEmployee() != null ? po.getEmployee().getCode() : null,
                po.getEmployee() != null ? po.getEmployee().getName() : null,
                status.getDisplayName()));
    }

    /**
     * 미구매 발주 줄 — 발주수량에서 이미 구매로 끊은 수량을 뺀 잔량이 남은 줄만.
     * 같은 품목이 한 발주에 여러 줄이면 앞 줄부터 채운다(구매 줄은 발주 헤더만 가리켜 품목으로 맞춘다).
     */
    @Transactional(readOnly = true)
    public List<PurchaseOrderDtos.UnpurchasedLineResponse> findUnpurchased(LocalDate from, LocalDate to) {
        java.util.Map<String, BigDecimal> bought = new java.util.HashMap<>();
        for (var a : purchaseLineRepository.aggregateBoughtAll()) {
            bought.merge(a.getOrderId() + ":" + a.getItemId(), a.getQty(), BigDecimal::add);
        }
        List<PurchaseOrderDtos.UnpurchasedLineResponse> out = new java.util.ArrayList<>();
        for (PurchaseOrder po : orderRepository.findAllWithRefs()) {
            if (po.getStatus() == PurchaseOrderStatus.CANCELLED || po.getStatus() == PurchaseOrderStatus.RECEIVED
                    || po.getConvertedPurchaseId() != null) continue;
            if (from != null && po.getOrderDate().isBefore(from)) continue;   // 기간을 주면 그 기간에 낸 발주만
            if (to != null && po.getOrderDate().isAfter(to)) continue;
            java.util.Map<Long, BigDecimal> left = new java.util.HashMap<>();
            for (PurchaseOrderLine l : po.getLines()) {
                Long itemId = l.getItem().getId();
                BigDecimal pool = left.computeIfAbsent(itemId, k -> bought.getOrDefault(po.getId() + ":" + k, BigDecimal.ZERO));
                BigDecimal used = pool.min(l.getQuantity()).max(BigDecimal.ZERO);
                left.put(itemId, pool.subtract(used));
                BigDecimal rest = l.getQuantity().subtract(used);
                if (rest.signum() <= 0) continue;
                out.add(new PurchaseOrderDtos.UnpurchasedLineResponse(
                        po.getId(), po.getOrderNo(), l.getId(), po.getOrderDate(),
                        po.getPartner() != null ? po.getPartner().getId() : null, po.getPartner() != null ? po.getPartner().getName() : null, po.getStatus().getDisplayName(),
                        po.getWarehouse() != null ? po.getWarehouse().getId() : null,
                        po.getProject() != null ? po.getProject().getId() : null,
                        itemId, l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                        l.getQuantity(), used, rest, l.getUnitPrice()));
            }
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<PurchaseOrderResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<PurchaseOrderResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? orderRepository.findAllWithRefs()
                : orderRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream()
                .map(PurchaseOrderResponse::from)
                .toList();
    }

    /** 특정 진행상태의 발주서만 조회한다(발주요청조회/현황 등에서 사용). */
    @Transactional(readOnly = true)
    public List<PurchaseOrderResponse> findByStatus(PurchaseOrderStatus status) {
        return orderRepository.findByStatusWithRefs(status).stream()
                .map(PurchaseOrderResponse::from)
                .toList();
    }

    /**
     * 상태와 기간을 <b>함께</b> 건다. 하나만 주면 그것만 걸고, 둘 다 안 주면 전 기간이다.
     *
     * <p>예전에는 컨트롤러가 <code>status</code> 가 있으면 기간을 <b>말없이 버렸다</b> —
     * 부른 쪽은 좁힌 줄 알고 전 기간을 본다. 200이 오고 자료도 그럴듯해 아무도 모른다.
     */
    @Transactional(readOnly = true)
    public List<PurchaseOrderResponse> findAll(PurchaseOrderStatus status, LocalDate from, LocalDate to) {
        var rows = status != null ? findByStatus(status) : findAll(from, to);
        if (status == null || (from == null && to == null)) return rows;
        String f = from != null ? from.toString() : null;
        String t = to != null ? to.toString() : null;
        return rows.stream()
                .filter(o -> f == null || o.orderDate().toString().compareTo(f) >= 0)
                .filter(o -> t == null || o.orderDate().toString().compareTo(t) <= 0)
                .toList();
    }

    /**
     * 발주 파이프라인을 상태별로 집계한다(건수·공급가액·부가세·합계).
     * 모든 상태를 항상 한 줄씩 반환하며, 자료가 없는 상태는 0으로 채운다.
     */
    @Transactional(readOnly = true)
    public List<PurchaseOrderDtos.PurchaseOrderSummaryRow> summary() {
        List<PurchaseOrder> all = orderRepository.findAllWithRefs();
        List<PurchaseOrderDtos.PurchaseOrderSummaryRow> out = new java.util.ArrayList<>();
        for (PurchaseOrderStatus st : PurchaseOrderStatus.values()) {
            long count = 0;
            BigDecimal supply = BigDecimal.ZERO, vat = BigDecimal.ZERO, total = BigDecimal.ZERO;
            for (PurchaseOrder po : all) {
                if (po.getStatus() != st) continue;
                count++;
                supply = supply.add(nz(po.getSupplyAmount()));
                vat = vat.add(nz(po.getVatAmount()));
                total = total.add(nz(po.getTotalAmount()));
            }
            out.add(new PurchaseOrderDtos.PurchaseOrderSummaryRow(
                    st, st.getDisplayName(), count, supply, vat, total));
        }
        return out;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    /**
     * 전표 종류마다 <b>번호를 따로</b> 센다(원본 2026-10-21 loginaa 실측) — 같은 날 단가요청 '2026/10/21 -2' 를 두고 발주서를 쓰면
     * 발주서는 '26/10/21-1' 이다. 발주요청 '26/10/12-2' · 발주계획 '2026/10/11 -1' 도 각자 센다. 한 표에 같이 들어 있어서
     * 접두어로 번호 공간을 가른다(DocumentNoGenerator 가 접두어 + 날짜마다 최댓값 + 1). 발주서는 옛 'PR-' 를 그대로 쓴다.
     */
    static String noPrefix(PurchaseOrderStatus kind) {
        return switch (kind) {
            case REQUESTED -> "RQ-";
            case PLANNED -> "PL-";
            case PRICE_REQUESTED -> "PQ-";
            default -> "PR-";
        };
    }

    /**
     * 머리 거래처 — 발주요청 · 발주계획은 <b>비워도 된다</b>(원본 E040315 실측: 거래처 칸은 줄마다, 비워 두고 저장되고 조회 거래처도 빈칸).
     * 발주서 · 단가요청은 거래처가 머리에 하나라 꼭 있어야 한다.
     */
    private BusinessPartner headPartner(Long partnerId, PurchaseOrderStatus kind) {
        if (partnerId == null) {
            if (kind == PurchaseOrderStatus.REQUESTED || kind == PurchaseOrderStatus.PLANNED) return null;
            throw ApiException.badRequest("매입처를 선택하세요.");
        }
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(partnerId)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + partnerId)));
        if (!partner.getType().canBuy()) {
            throw ApiException.badRequest("매입처가 아닌 거래처에는 발주할 수 없습니다: " + partner.getName());
        }
        return partner;
    }

    /** 발주요청 등록. 단가 미입력 라인은 품목 기준단가로 채운다. */
    @Transactional
    public PurchaseOrderResponse create(CreatePurchaseOrderRequest req, String username) {
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        Employee employee = req.employeeId() == null ? null : employeeRepository.findById(req.employeeId())
                .orElseThrow(() -> ApiException.notFound("담당자를 찾을 수 없습니다. id=" + req.employeeId()));
        Warehouse warehouse = req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId());
        String currency = (req.currency() == null || req.currency().isBlank()) ? "KRW" : req.currency().trim();

        PurchaseOrderStatus kind = Boolean.TRUE.equals(req.priceRequest()) ? PurchaseOrderStatus.PRICE_REQUESTED
                : Boolean.TRUE.equals(req.order()) ? PurchaseOrderStatus.ORDERED
                : Boolean.TRUE.equals(req.plan()) ? PurchaseOrderStatus.PLANNED : PurchaseOrderStatus.REQUESTED;
        BusinessPartner partner = headPartner(req.partnerId(), kind);
        PurchaseOrder po = PurchaseOrder.builder()
                .orderNo(docNoGenerator.next(noPrefix(kind), "purchase_orders", "order_no", "order_date", orderDate))
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .priceValidUntil(req.priceValidUntil())
                .partner(partner)
                .employee(employee)
                .warehouse(warehouse)
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .currency(currency)
                /*
                 * 발주요청 · 발주계획 · 발주서는 <b>다른 전표</b>다(원본 E040315 실측) — 다음 전표는 앞 전표를 베껴 새로 만들고
                 * 앞 전표의 상태는 그대로 둔다. 발주계획입력(E040316)은 계획, 발주서입력은 바로 발주확정(구매 [발주] 잔량적용 대상).
                 */
                .status(kind)
                .taxable(req.taxable() == null || req.taxable())
                .remark(req.remark())
                .createdBy(username)
                .updatedBy(username)
                .build();

        for (OrderLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal unitPrice = lr.unitPrice() != null ? lr.unitPrice() : item.getUnitPrice();
            BusinessPartner linePartner = lr.partnerId() == null ? null
                    : TradeMasters.requireUsable(partnerRepository.findById(lr.partnerId())
                            .orElseThrow(() -> ApiException.notFound("라인 거래처를 찾을 수 없습니다. id=" + lr.partnerId())));
            PurchaseOrderLine line = PurchaseOrderLine.builder()
                    .item(item).quantity(lr.quantity()).inputQuantity(lr.quantity()).planCalcDate(po.getOrderDate()).unitPrice(unitPrice)
                    .partner(linePartner).remark(lr.remark())
                    .build();
            linkSource(line, lr.sourceLineId());
            po.addLine(line);
        }
        recalculate(po);

        PurchaseOrder saved = orderRepository.save(po);
        /* 첫 줄은 <b>만들어진 것</b>이다. 넘어오기 전 상태가 없으니 from 은 비운다. */
        trace(saved, null, saved.getStatus(), username, null);
        return PurchaseOrderResponse.from(saved);
    }

    /**
     * 발주요청 고치기 — 원본 발주요청조회에서 [발주요청일자]를 눌러 여는 '발주요청입력(수정)' 창(2026-10-13 loginaa 실측).
     *
     * <p>원본은 일자를 잠그고 나머지(거래처 · 품목 줄 · 창고 · 납기 …)를 고친다. 그래서 일자 · 번호는 그대로 두고
     * 머리와 줄을 통째로 바꾼다. 발주계획 이후로 넘어간 것은 이미 다음 단계가 그 줄을 보고 있어 막는다.
     */
    @Transactional
    public PurchaseOrderResponse update(Long id, CreatePurchaseOrderRequest req, String username) {
        PurchaseOrder po = get(id);
        /* 발주계획조회의 [일자-No.] 도 같은 창(발주계획입력 수정)으로 계획을 고친다 — 단가확정 이후는 다음 단계가 본다. */
        if (po.getStatus() != PurchaseOrderStatus.REQUESTED && po.getStatus() != PurchaseOrderStatus.PLANNED
                && po.getStatus() != PurchaseOrderStatus.PRICE_REQUESTED) {
            throw ApiException.badRequest("발주요청 · 발주계획 · 단가요청 상태에서만 고칠 수 있습니다. (현재: " + po.getStatus().getDisplayName() + ")");
        }
        BusinessPartner partner = headPartner(req.partnerId(), po.getStatus());
        po.setPartner(partner);
        po.setDueDate(req.dueDate());
        po.setEmployee(req.employeeId() == null ? null : employeeRepository.findById(req.employeeId())
                .orElseThrow(() -> ApiException.notFound("담당자를 찾을 수 없습니다. id=" + req.employeeId())));
        po.setWarehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()));
        po.setProject(req.projectId() == null ? null : projectService.get(req.projectId()));
        po.setCurrency((req.currency() == null || req.currency().isBlank()) ? "KRW" : req.currency().trim());
        if (req.taxable() != null) po.setTaxable(req.taxable());
        po.setRemark(req.remark());
        if (po.getStatus() == PurchaseOrderStatus.PRICE_REQUESTED) po.setPriceValidUntil(req.priceValidUntil());
        /* 줄은 지우고 다시 단다. 지운 것을 먼저 내보내야 새 줄의 번호(1, 2 …)가 옛 줄과 겹치지 않는다. */
        po.getLines().clear();
        orderRepository.saveAndFlush(po);
        for (OrderLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal unitPrice = lr.unitPrice() != null ? lr.unitPrice() : item.getUnitPrice();
            BusinessPartner linePartner = lr.partnerId() == null ? null
                    : TradeMasters.requireUsable(partnerRepository.findById(lr.partnerId())
                            .orElseThrow(() -> ApiException.notFound("라인 거래처를 찾을 수 없습니다. id=" + lr.partnerId())));
            PurchaseOrderLine line = PurchaseOrderLine.builder()
                    .item(item).quantity(lr.quantity()).inputQuantity(lr.quantity()).planCalcDate(po.getOrderDate()).unitPrice(unitPrice)
                    .partner(linePartner).remark(lr.remark())
                    .build();
            linkSource(line, lr.sourceLineId());
            po.addLine(line);
        }
        recalculate(po);
        po.setUpdatedBy(username);
        recordHistory(po, com.erp.common.history.ChangeHistoryService.UPDATED, po.getStatus());
        return PurchaseOrderResponse.from(orderRepository.save(po));
    }

    /**
     * 발주계획조회 격자에서 줄 하나를 고친다(원본 C000076, 2026-10-13 실측).
     *
     * <p>수량 · 단가는 칸을 벗어나면 저장되고 금액 · 부가세 · 합계가 다시 계산된다. 발주로 넘어간 계획(발주확정 이후)은
     * 이미 발주서가 그 값을 보고 있어 막는다. [종결여부] '종결' · 완료 탭 '취소' 는 그 줄만 닫고 연다 — 확인 창 없이 바로.
     */
    @Transactional
    public PurchaseOrderResponse updatePlanLine(Long id, Long lineId, PlanLineRequest req, String username) {
        PurchaseOrder po = get(id);
        if (po.getStatus() != PurchaseOrderStatus.PLANNED && po.getStatus() != PurchaseOrderStatus.PRICED) {
            throw ApiException.badRequest("발주계획 상태에서만 고칠 수 있습니다. (현재: " + po.getStatus().getDisplayName() + ")");
        }
        PurchaseOrderLine line = po.getLines().stream()
                .filter(l -> l.getId().equals(lineId))
                .findFirst()
                .orElseThrow(() -> ApiException.badRequest("발주서 " + po.getOrderNo() + " 에 없는 라인입니다. lineId=" + lineId));
        if (req.quantity() != null) line.setQuantity(req.quantity());
        if (req.unitPrice() != null) line.setUnitPrice(req.unitPrice());
        if (req.closed() != null) line.setPlanClosed(req.closed());
        if (Boolean.TRUE.equals(req.calculated())) line.setPlanCalcDate(LocalDate.now());
        recalculate(po);
        po.setUpdatedBy(username);
        return PurchaseOrderResponse.from(po);
    }

    /** 발주계획 확정 (발주요청 → 발주계획). 납기일을 여기서 정한다. */
    @Transactional
    public PurchaseOrderResponse plan(Long id, PlanRequest req, String username) {
        PurchaseOrder po = get(id);
        expect(po, PurchaseOrderStatus.REQUESTED, "발주요청 상태의 발주서만 계획할 수 있습니다.");
        if (req != null && req.dueDate() != null) {
            po.setDueDate(req.dueDate());
        }
        trace(po, po.getStatus(), PurchaseOrderStatus.PLANNED, username,
                po.getDueDate() != null ? "납기일 " + po.getDueDate() : null);
        po.setStatus(PurchaseOrderStatus.PLANNED);
        return PurchaseOrderResponse.from(po);
    }

    /** 단가요청 회신 반영 (발주계획 → 단가확정). 확정된 단가로 금액·부가세를 다시 계산한다. */
    @Transactional
    public PurchaseOrderResponse applyPrices(Long id, ApplyPricesRequest req, String username) {
        PurchaseOrder po = get(id);
        if (po.getStatus() != PurchaseOrderStatus.PLANNED && po.getStatus() != PurchaseOrderStatus.PRICED) {
            throw ApiException.badRequest("발주계획 상태의 발주서만 단가를 확정할 수 있습니다.");
        }
        for (LinePriceRequest lp : req.lines()) {
            PurchaseOrderLine line = po.getLines().stream()
                    .filter(l -> l.getId().equals(lp.lineId()))
                    .findFirst()
                    .orElseThrow(() -> ApiException.badRequest(
                            "발주서 " + po.getOrderNo() + " 에 없는 라인입니다. lineId=" + lp.lineId()));
            line.setUnitPrice(lp.unitPrice());
        }
        /* 매입처는 단가와 함께 <b>언제까지 유효한지</b>를 준다. 안 주면 그대로 둔다. */
        if (req.priceValidUntil() != null) {
            po.setPriceValidUntil(req.priceValidUntil());
        }
        recalculate(po);
        trace(po, po.getStatus(), PurchaseOrderStatus.PRICED, username,
                po.getPriceValidUntil() != null ? "유효기간 " + po.getPriceValidUntil() : null);
        po.setStatus(PurchaseOrderStatus.PRICED);
        return PurchaseOrderResponse.from(po);
    }

    /**
     * 단가요청진행단계 [수취단가확인] · [단가확정](원본 E040323) — 단가요청 줄에 매입처가 준 수취단가와 확정단가를 적는다.
     * 요청단가(unitPrice)와 금액은 그대로다(원본 단가요청조회 [금액(합계)] 는 요청단가 기준). 확정단가는 발주서로 베낄 때 발주서 단가가 된다.
     */
    @Transactional
    public PurchaseOrderResponse applyPriceSteps(Long id, PurchaseOrderDtos.PriceStepRequest req, String username) {
        PurchaseOrder po = get(id);
        expect(po, PurchaseOrderStatus.PRICE_REQUESTED, "단가요청 전표만 수취단가 · 확정단가를 적을 수 있습니다.");
        for (PurchaseOrderDtos.PriceStepLine sl : req.lines()) {
            PurchaseOrderLine line = po.getLines().stream()
                    .filter(l -> l.getId().equals(sl.lineId()))
                    .findFirst()
                    .orElseThrow(() -> ApiException.badRequest("단가요청 " + po.getOrderNo() + " 에 없는 라인입니다. lineId=" + sl.lineId()));
            if (sl.receivedPrice() != null) line.setReceivedPrice(sl.receivedPrice());
            if (sl.confirmedPrice() != null) line.setConfirmedPrice(sl.confirmedPrice());
        }
        if (req.priceValidUntil() != null) po.setPriceValidUntil(req.priceValidUntil());
        po.setUpdatedBy(username);
        return PurchaseOrderResponse.from(po);
    }

    /** 발주 확정 (단가확정 → 발주확정). 이 시점의 발주서를 매입처에 보낸다. */
    @Transactional
    public PurchaseOrderResponse confirm(Long id, String username) {
        PurchaseOrder po = get(id);
        expect(po, PurchaseOrderStatus.PRICED, "단가가 확정된 발주서만 발주할 수 있습니다.");
        /*
         * <b>지난 단가로는 발주하지 않는다.</b> 유효기간을 적어 두고도 그냥 통과시키면
         * 그 칸은 아무 일도 안 하는 장식이 된다 — 물건이 들어오고 청구서가 와서야
         * 값이 다른 것을 안다. 늦었으면 매입처에 다시 물어 기간을 고치고 발주한다.
         */
        if (po.getPriceValidUntil() != null && po.getPriceValidUntil().isBefore(LocalDate.now())) {
            throw ApiException.badRequest(
                    "단가 유효기간이 지났습니다(" + po.getPriceValidUntil() + "). "
                    + "매입처에 다시 확인해 유효기간을 고친 뒤 발주하세요.");
        }
        trace(po, po.getStatus(), PurchaseOrderStatus.ORDERED, username, null);
        po.setStatus(PurchaseOrderStatus.ORDERED);
        return PurchaseOrderResponse.from(po);
    }

    /**
     * 발주요청조회 [진행상태변경] · [종결여부] — 미확인 / 진행중 / 완료(원본 E040315, 2026-10-13 실측).
     * 발주 흐름 상태는 건드리지 않는다. 원본도 완료로 바꾼 요청을 그대로 고치고 지울 수 있다.
     */
    @Transactional
    public PurchaseOrderResponse changeRequestProgress(Long id, PurchaseRequestProgress progress) {
        if (progress == null) throw ApiException.badRequest("진행상태를 고르세요.");
        PurchaseOrder po = get(id);
        po.setRequestProgress(progress);
        return PurchaseOrderResponse.from(po);
    }

    @Transactional
    public PurchaseOrderResponse cancel(Long id, String username) {
        PurchaseOrder po = get(id);
        if (po.getStatus() == PurchaseOrderStatus.RECEIVED) {
            throw ApiException.badRequest("이미 입고된 발주서는 취소할 수 없습니다.");
        }
        /*
         * <b>이미 취소된 것을 또 취소하지 않는다.</b> 예전에는 그냥 통과해서, 화면이 느릴 때
         * [취소]를 두 번 누르면 발주서 이력에 <b>"취소 → 취소"</b> 가 누른 만큼 쌓였다.
         * 일어나지도 않은 전이가 이력에 남으면, 나중에 그 발주서에 무슨 일이 있었는지
         * 읽는 사람이 잘못 읽는다. 형제 자리(입고전환·견적 수주전환)가 쓰는 말투를 따른다.
         */
        if (po.getStatus() == PurchaseOrderStatus.CANCELLED) {
            throw ApiException.conflict("이미 취소된 발주서입니다: " + po.getOrderNo());
        }
        trace(po, po.getStatus(), PurchaseOrderStatus.CANCELLED, username, null);
        po.setStatus(PurchaseOrderStatus.CANCELLED);
        return PurchaseOrderResponse.from(po);
    }

    /**
     * 입고 전환 (발주확정 → 입고전환): 발주 라인으로 구매전표를 만든다.
     * 재고 증가와 채무 반영은 PurchaseService 가 소유한다 — 여기서 재고를 직접 건드리지 않는다.
     */
    @Transactional
    public PurchaseResponse receive(Long id, ReceiveRequest req, String username) {
        PurchaseOrder po = get(id);
        if (po.getStatus() == PurchaseOrderStatus.RECEIVED) {
            throw ApiException.conflict("이미 입고 전환된 발주서입니다: " + po.getOrderNo());
        }
        if (po.getStatus() == PurchaseOrderStatus.CANCELLED) {
            throw ApiException.badRequest("취소된 발주서는 입고할 수 없습니다.");
        }
        if (po.getStatus() != PurchaseOrderStatus.ORDERED) {
            throw ApiException.badRequest("발주확정 상태의 발주서만 입고할 수 있습니다.");
        }

        if (po.getPartner() == null) throw ApiException.badRequest("거래처가 없는 발주서는 입고할 수 없습니다.");
        List<PurchaseLineRequest> lines = po.getLines().stream()
                // 입고전환으로 생긴 라인은 이 발주서가 근거전표다 — 구매입력에서 [불러온 전표]로 보인다.
                .map(l -> new PurchaseLineRequest(l.getItem().getId(), l.getQuantity(), l.getUnitPrice(), l.getRemark(), null, null, po.getId(), null, null, null, null, null))
                .toList();
        LocalDate purchaseDate = req.purchaseDate() != null ? req.purchaseDate() : LocalDate.now();
        CreatePurchaseRequest purchaseReq = new CreatePurchaseRequest(
                po.getPartner().getId(), req.warehouseId(), purchaseDate, po.getTaxable(),
                Boolean.FALSE,  // 발주서 입고전환은 늘 일반 구매다
                "발주 " + po.getOrderNo() + " 입고", null, null,
                null,   // 거래별부가세계산: 발주서가 라인별로 계산해 둔 값을 그대로 승계한다
                null, null,   // 통화 · 환율: 내자
                lines);

        PurchaseResponse purchase = purchaseService.create(purchaseReq, username);
        // 구매 전표가 발주 전량을 끊었으면 PurchaseOrderProgress 가 이미 입고전환으로 닫았다 — 이력을 두 번 남기지 않는다.
        if (po.getStatus() != PurchaseOrderStatus.RECEIVED) {
            trace(po, po.getStatus(), PurchaseOrderStatus.RECEIVED, username, "구매전표 " + purchase.docNo());
            po.setStatus(PurchaseOrderStatus.RECEIVED);
        }
        po.setConvertedPurchaseId(purchase.id());
        return purchase;
    }

    /**
     * 베껴 온 앞 전표 줄을 단다 — 원본 줄 열 [발주요청] · [No] 처럼 그 전표 일자 · 번호를 글자로 남겨, 앞 전표를 지워도 보인다.
     * 앞 전표는 건드리지 않는다(원본: 계획이 생겨도 요청은 진행중 · 수량 그대로, 같은 요청을 몇 번이고 베낀다).
     */
    private void linkSource(PurchaseOrderLine line, Long sourceLineId) {
        if (sourceLineId == null) return;
        PurchaseOrderLine src = orderLineRepository.findWithOrderById(sourceLineId)
                .orElseThrow(() -> ApiException.notFound("불러온 전표의 줄을 찾을 수 없습니다. id=" + sourceLineId));
        line.setSourceLineId(src.getId());
        line.setSourceOrderNo(src.getPurchaseOrder().getOrderNo());
        line.setSourceOrderDate(src.getPurchaseOrder().getOrderDate());
    }

    private void recalculate(PurchaseOrder po) {
        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        for (PurchaseOrderLine l : po.getLines()) {
            BigDecimal supply = VatAllocator.lineSupply(l.getQuantity(), l.getUnitPrice());
            BigDecimal vat = po.getTaxable()
                    ? supply.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            l.setSupplyAmount(supply);
            l.setVatAmount(vat);
            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);
        }
        po.setSupplyAmount(totalSupply);
        po.setVatAmount(totalVat);
        po.setTotalAmount(totalSupply.add(totalVat));
    }

    private void expect(PurchaseOrder po, PurchaseOrderStatus required, String message) {
        if (po.getStatus() != required) {
            throw ApiException.badRequest(message + " (현재: " + po.getStatus().getDisplayName() + ")");
        }
    }

    /**
     * 발주 삭제.
     *
     * <p>입고로 전환돼 구매전표가 생겼으면 막는다 — 구매전표가 이 발주를 출처로 가리키고 있어서
     * 발주만 사라지면 그 전표의 근거가 없어진다. 구매전표를 먼저 지워야 한다.
     */
    @Transactional
    public void delete(Long id) {
        PurchaseOrder order = get(id);
        if (purchaseLineRepository.existsBySourceOrderId(id)) {
            throw ApiException.conflict(
                    "입고된 구매전표가 있어 지울 수 없습니다. 먼저 구매전표를 지우세요: " + order.getOrderNo());
        }
        recordHistory(order, com.erp.common.history.ChangeHistoryService.DELETED, order.getStatus());
        orderRepository.delete(order);
    }

    private PurchaseOrder get(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("발주서를 찾을 수 없습니다. id=" + id));
    }

    /**
     * 단계가 넘어간 자취를 남긴다. <b>상태를 바꾸는 자리마다</b> 부른다 —
     * 한 군데라도 빠뜨리면 이력에 구멍이 나고, 구멍 난 이력은 없는 것보다 나쁘다
     * (있는 줄 알고 믿게 된다).
     */
    private void trace(PurchaseOrder po, PurchaseOrderStatus from, PurchaseOrderStatus to,
                       String username, String note) {
        /* 단계를 넘긴 사람도 [최종수정자] 다. */
        if (username != null) po.setUpdatedBy(username);
        recordHistory(po, from == null ? com.erp.common.history.ChangeHistoryService.CREATED : com.erp.common.history.ChangeHistoryService.STATUS_CHANGED, to);
        historyRepository.save(com.erp.trade.purchaseorder.PurchaseOrderHistory.builder()
                .order(po)
                .changedAt(java.time.LocalDateTime.now())
                .fromStatus(from)
                .toStatus(to)
                .changedBy(username)
                .note(note)
                .build());
    }

    /** 한 발주가 밟아 온 자취. 화면이 [이력]을 펼칠 때 가져간다. */
    @Transactional(readOnly = true)
    public List<com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.HistoryRow> history(Long id) {
        get(id);   // 없는 발주면 404
        return historyRepository.findByOrderIdOrderByChangedAtAscIdAsc(id).stream()
                .map(com.erp.trade.purchaseorder.dto.PurchaseOrderDtos.HistoryRow::from)
                .toList();
    }
}
