package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.hr.domain.Employee;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.PurchaseOrder;
import com.erp.trade.domain.PurchaseOrderLine;
import com.erp.trade.domain.PurchaseOrderStatus;
import com.erp.inventory.domain.Warehouse;
import com.erp.trade.dto.PurchaseDtos.CreatePurchaseRequest;
import com.erp.trade.dto.PurchaseDtos.PurchaseLineRequest;
import com.erp.trade.dto.PurchaseDtos.PurchaseResponse;
import com.erp.trade.dto.PurchaseOrderDtos.ApplyPricesRequest;
import com.erp.trade.dto.PurchaseOrderDtos.CreatePurchaseOrderRequest;
import com.erp.trade.dto.PurchaseOrderDtos.LinePriceRequest;
import com.erp.trade.dto.PurchaseOrderDtos.OrderLineRequest;
import com.erp.trade.dto.PurchaseOrderDtos.PlanRequest;
import com.erp.trade.dto.PurchaseOrderDtos.PurchaseOrderResponse;
import com.erp.trade.dto.PurchaseOrderDtos.ReceiveRequest;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.hr.repository.EmployeeRepository;
import com.erp.trade.repository.PurchaseOrderRepository;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.WarehouseService;
import com.erp.trade.repository.PurchaseLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.PurchaseDtos;
import com.erp.trade.dto.PurchaseOrderDtos;

/**
 * 발주서: 발주요청 → 발주계획 → 단가확정 → 발주확정 → 구매입고 전환.
 * 재고는 구매전표(Purchase)로 전환될 때만 움직인다. 발주 자체는 재고를 건드리지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PurchaseOrderService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final PurchaseOrderRepository orderRepository;
    /* 다른 모듈의 값은 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final ProjectService projectService;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    private final EmployeeRepository employeeRepository;
    private final WarehouseService warehouseService;
    private final PurchaseService purchaseService;
    private final PurchaseLineRepository purchaseLineRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<PurchaseOrderResponse> findAll() {
        return orderRepository.findAllWithRefs().stream()
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

    /** 발주요청 등록. 단가 미입력 라인은 품목 기준단가로 채운다. */
    @Transactional
    public PurchaseOrderResponse create(CreatePurchaseOrderRequest req, String username) {
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        if (!partner.getType().canBuy()) {
            throw ApiException.badRequest("매입처가 아닌 거래처에는 발주할 수 없습니다: " + partner.getName());
        }
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        Employee employee = req.employeeId() == null ? null : employeeRepository.findById(req.employeeId())
                .orElseThrow(() -> ApiException.notFound("담당자를 찾을 수 없습니다. id=" + req.employeeId()));
        Warehouse warehouse = req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId());
        String currency = (req.currency() == null || req.currency().isBlank()) ? "KRW" : req.currency().trim();

        PurchaseOrder po = PurchaseOrder.builder()
                .orderNo(docNoGenerator.next("PR-", "purchase_orders", "order_no", "order_date", orderDate))
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .priceValidUntil(req.priceValidUntil())
                .partner(partner)
                .employee(employee)
                .warehouse(warehouse)
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .currency(currency)
                .status(PurchaseOrderStatus.REQUESTED)
                .taxable(req.taxable() == null || req.taxable())
                .remark(req.remark())
                .createdBy(username)
                .build();

        for (OrderLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal unitPrice = lr.unitPrice() != null ? lr.unitPrice() : item.getUnitPrice();
            BusinessPartner linePartner = lr.partnerId() == null ? null
                    : TradeMasters.requireUsable(partnerRepository.findById(lr.partnerId())
                            .orElseThrow(() -> ApiException.notFound("라인 거래처를 찾을 수 없습니다. id=" + lr.partnerId())));
            po.addLine(PurchaseOrderLine.builder()
                    .item(item).quantity(lr.quantity()).unitPrice(unitPrice)
                    .partner(linePartner).remark(lr.remark())
                    .build());
        }
        recalculate(po);

        return PurchaseOrderResponse.from(orderRepository.save(po));
    }

    /** 발주계획 확정 (발주요청 → 발주계획). 납기일을 여기서 정한다. */
    @Transactional
    public PurchaseOrderResponse plan(Long id, PlanRequest req) {
        PurchaseOrder po = get(id);
        expect(po, PurchaseOrderStatus.REQUESTED, "발주요청 상태의 발주서만 계획할 수 있습니다.");
        if (req != null && req.dueDate() != null) {
            po.setDueDate(req.dueDate());
        }
        po.setStatus(PurchaseOrderStatus.PLANNED);
        return PurchaseOrderResponse.from(po);
    }

    /** 단가요청 회신 반영 (발주계획 → 단가확정). 확정된 단가로 금액·부가세를 다시 계산한다. */
    @Transactional
    public PurchaseOrderResponse applyPrices(Long id, ApplyPricesRequest req) {
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
        po.setStatus(PurchaseOrderStatus.PRICED);
        return PurchaseOrderResponse.from(po);
    }

    /** 발주 확정 (단가확정 → 발주확정). 이 시점의 발주서를 매입처에 보낸다. */
    @Transactional
    public PurchaseOrderResponse confirm(Long id) {
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
        po.setStatus(PurchaseOrderStatus.ORDERED);
        return PurchaseOrderResponse.from(po);
    }

    @Transactional
    public PurchaseOrderResponse cancel(Long id) {
        PurchaseOrder po = get(id);
        if (po.getStatus() == PurchaseOrderStatus.RECEIVED) {
            throw ApiException.badRequest("이미 입고된 발주서는 취소할 수 없습니다.");
        }
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

        List<PurchaseLineRequest> lines = po.getLines().stream()
                // 입고전환으로 생긴 라인은 이 발주서가 근거전표다 — 구매입력에서 [불러온 전표]로 보인다.
                .map(l -> new PurchaseLineRequest(l.getItem().getId(), l.getQuantity(), l.getUnitPrice(), l.getRemark(), null, null, po.getId()))
                .toList();
        LocalDate purchaseDate = req.purchaseDate() != null ? req.purchaseDate() : LocalDate.now();
        CreatePurchaseRequest purchaseReq = new CreatePurchaseRequest(
                po.getPartner().getId(), req.warehouseId(), purchaseDate, po.getTaxable(),
                Boolean.FALSE,  // 발주서 입고전환은 늘 일반 구매다
                "발주 " + po.getOrderNo() + " 입고", null, null,
                null,   // 거래별부가세계산: 발주서가 라인별로 계산해 둔 값을 그대로 승계한다
                lines);

        PurchaseResponse purchase = purchaseService.create(purchaseReq, username);
        po.setStatus(PurchaseOrderStatus.RECEIVED);
        po.setConvertedPurchaseId(purchase.id());
        return purchase;
    }

    private void recalculate(PurchaseOrder po) {
        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        for (PurchaseOrderLine l : po.getLines()) {
            BigDecimal supply = l.getQuantity().multiply(l.getUnitPrice());
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
        orderRepository.delete(order);
    }

    private PurchaseOrder get(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("발주서를 찾을 수 없습니다. id=" + id));
    }
}
