package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.*;
import com.erp.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.dto.SalesOrderDtos.OrderLineRequest;
import com.erp.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.dto.SalesOrderDtos.ShipLineRequest;
import com.erp.dto.SalesOrderDtos.ShipRequest;
import com.erp.dto.SalesOrderDtos.UnshippedLineResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.SalesOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SalesOrderService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final SalesOrderRepository salesOrderRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemRepository itemRepository;

    @Transactional(readOnly = true)
    public List<SalesOrderResponse> findAll() {
        return salesOrderRepository.findAllWithPartner().stream()
                .map(SalesOrderResponse::from)
                .toList();
    }

    /** 미출하현황: 접수·진행중 주문의 라인들(완료·취소 제외). 현 모델은 부분출하 미추적 → 미출하잔량 = 주문수량 */
    @Transactional(readOnly = true)
    public List<UnshippedLineResponse> findUnshipped() {
        List<SalesOrderStatus> open = List.of(SalesOrderStatus.RECEIVED, SalesOrderStatus.IN_PROGRESS);
        return salesOrderRepository.findByStatusesWithLines(open).stream()
                .flatMap(o -> o.getLines().stream().map(l -> UnshippedLineResponse.of(o, l)))
                .toList();
    }

    @Transactional
    public SalesOrderResponse create(CreateSalesOrderRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
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
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
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
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "SN-" + d + "-" + String.format("%04d", salesOrderRepository.count() + 1);
    }
}
