package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.SalesOrderLine;
import com.erp.trade.domain.SalesOrderStatus;
import com.erp.trade.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.dto.SalesOrderDtos.OrderLineRequest;
import com.erp.trade.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.dto.SalesOrderDtos.UnshippedLineResponse;
import com.erp.trade.dto.SalesOrderDtos.UnsoldLineResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.SalesLineRepository;
import com.erp.trade.repository.SalesOrderRepository;
import com.erp.inventory.service.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.erp.trade.dto.SalesOrderDtos;

@Service
@RequiredArgsConstructor
public class SalesOrderService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final SalesOrderRepository salesOrderRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    private final SalesLineRepository salesLineRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<SalesOrderResponse> findAll() {
        return salesOrderRepository.findAllWithPartner().stream()
                .map(SalesOrderResponse::from)
                .toList();
    }

    /** 미출하현황: 접수·진행중 주문의 라인들(완료·취소 제외). 미출하잔량 = 주문수량 − 누적 출하완료수량 */
    @Transactional(readOnly = true)
    public List<UnshippedLineResponse> findUnshipped() {
        List<SalesOrderStatus> open = List.of(SalesOrderStatus.RECEIVED, SalesOrderStatus.IN_PROGRESS);
        return salesOrderRepository.findByStatusesWithLines(open).stream()
                .flatMap(o -> o.getLines().stream().map(l -> UnshippedLineResponse.of(o, l)))
                .toList();
    }

    /**
     * 미판매현황: 접수·진행중 주문의 라인 중 아직 판매 전표로 안 끊은 잔량.
     * 미출하(출하 여부)와 다른 질문이다 — 출하는 됐는데 매출을 못 잡은 건도 여기 남는다.
     */
    @Transactional(readOnly = true)
    public List<UnsoldLineResponse> findUnsold() {
        Map<String, BigDecimal> sold = new HashMap<>();
        for (SalesLineRepository.OrderItemAggregate a : salesLineRepository.aggregateSoldByOrderAndItem()) {
            sold.merge(a.getOrderId() + ":" + a.getItemId(), a.getQty(), BigDecimal::add);
        }
        List<SalesOrderStatus> open = List.of(SalesOrderStatus.RECEIVED, SalesOrderStatus.IN_PROGRESS);
        return salesOrderRepository.findByStatusesWithLines(open).stream()
                .flatMap(o -> o.getLines().stream()
                        .map(l -> UnsoldLineResponse.of(o, l, sold.get(o.getId() + ":" + l.getItem().getId()))))
                .filter(r -> r.unsoldQty().signum() > 0)
                .toList();
    }

    @Transactional
    public SalesOrderResponse create(CreateSalesOrderRequest req, String username) {
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 주문을 받을 수 없습니다: " + partner.getName());
        }

        boolean taxable = req.taxable() == null || req.taxable();
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        SalesOrder order = SalesOrder.builder()
                .orderNo(generateOrderNo(orderDate))
                .partner(partner)
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .status(SalesOrderStatus.RECEIVED)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;

        for (OrderLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal supply = lr.quantity().multiply(lr.unitPrice());
            BigDecimal vat = taxable ? supply.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP) : BigDecimal.ZERO;

            order.addLine(SalesOrderLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(lr.unitPrice())
                    .supplyAmount(supply)
                    .vatAmount(vat)
                    .build());

            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);
        }

        order.setSupplyAmount(totalSupply);
        order.setVatAmount(totalVat);
        order.setTotalAmount(totalSupply.add(totalVat));

        return SalesOrderResponse.from(salesOrderRepository.save(order));
    }

    @Transactional
    public SalesOrderResponse updateStatus(Long id, SalesOrderStatus status) {
        SalesOrder order = salesOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("주문서를 찾을 수 없습니다. id=" + id));
        order.setStatus(status);
        return SalesOrderResponse.from(order);
    }

    private String generateOrderNo(LocalDate date) {
        return docNoGenerator.next("SN-", "sales_orders", "order_no", "order_date", date);
    }

    /** 통합검색용. 수주번호·거래처명 부분일치 상위 limit 건과 총 건수. */
    @Transactional(readOnly = true)
    public List<SalesOrderResponse> search(String like, int limit) {
        return salesOrderRepository.searchTop(like, PageRequest.of(0, limit)).stream()
                .map(SalesOrderResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long searchCount(String like) {
        return salesOrderRepository.searchCount(like);
    }

}
