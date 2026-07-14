package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.BusinessPartner;
import com.erp.domain.Item;
import com.erp.domain.PurchaseOrder;
import com.erp.domain.PurchaseOrderLine;
import com.erp.domain.PurchaseOrderStatus;
import com.erp.dto.PurchaseDtos.CreatePurchaseRequest;
import com.erp.dto.PurchaseDtos.PurchaseLineRequest;
import com.erp.dto.PurchaseDtos.PurchaseResponse;
import com.erp.dto.PurchaseOrderDtos.ApplyPricesRequest;
import com.erp.dto.PurchaseOrderDtos.CreatePurchaseOrderRequest;
import com.erp.dto.PurchaseOrderDtos.LinePriceRequest;
import com.erp.dto.PurchaseOrderDtos.OrderLineRequest;
import com.erp.dto.PurchaseOrderDtos.PlanRequest;
import com.erp.dto.PurchaseOrderDtos.PurchaseOrderResponse;
import com.erp.dto.PurchaseOrderDtos.ReceiveRequest;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.PurchaseOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

/**
 * 발주서: 발주요청 → 발주계획 → 단가확정 → 발주확정 → 구매입고 전환.
 * 재고는 구매전표(Purchase)로 전환될 때만 움직인다. 발주 자체는 재고를 건드리지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PurchaseOrderService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final PurchaseOrderRepository orderRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemRepository itemRepository;
    private final PurchaseService purchaseService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<PurchaseOrderResponse> findAll() {
        return orderRepository.findAllWithRefs().stream()
                .map(PurchaseOrderResponse::from)
                .toList();
    }

    /** 발주요청 등록. 단가 미입력 라인은 품목 기준단가로 채운다. */
    @Transactional
    public PurchaseOrderResponse create(CreatePurchaseOrderRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (!partner.getType().canBuy()) {
            throw ApiException.badRequest("매입처가 아닌 거래처에는 발주할 수 없습니다: " + partner.getName());
        }
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        PurchaseOrder po = PurchaseOrder.builder()
                .orderNo(docNoGenerator.next("PR-", "purchase_orders", "order_no", "order_date", orderDate))
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .partner(partner)
                .status(PurchaseOrderStatus.REQUESTED)
                .taxable(req.taxable() == null || req.taxable())
                .remark(req.remark())
                .createdBy(username)
                .build();

        for (OrderLineRequest lr : req.lines()) {
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
            BigDecimal unitPrice = lr.unitPrice() != null ? lr.unitPrice() : item.getUnitPrice();
            po.addLine(PurchaseOrderLine.builder()
                    .item(item).quantity(lr.quantity()).unitPrice(unitPrice)
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
        recalculate(po);
        po.setStatus(PurchaseOrderStatus.PRICED);
        return PurchaseOrderResponse.from(po);
    }

    /** 발주 확정 (단가확정 → 발주확정). 이 시점의 발주서를 매입처에 보낸다. */
    @Transactional
    public PurchaseOrderResponse confirm(Long id) {
        PurchaseOrder po = get(id);
        expect(po, PurchaseOrderStatus.PRICED, "단가가 확정된 발주서만 발주할 수 있습니다.");
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
                .map(l -> new PurchaseLineRequest(l.getItem().getId(), l.getQuantity(), l.getUnitPrice()))
                .toList();
        LocalDate purchaseDate = req.purchaseDate() != null ? req.purchaseDate() : LocalDate.now();
        CreatePurchaseRequest purchaseReq = new CreatePurchaseRequest(
                po.getPartner().getId(), req.warehouseId(), purchaseDate, po.getTaxable(),
                "발주 " + po.getOrderNo() + " 입고", null, null, lines);

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

    private PurchaseOrder get(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("발주서를 찾을 수 없습니다. id=" + id));
    }
}
