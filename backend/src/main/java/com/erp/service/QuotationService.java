package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.BusinessPartner;
import com.erp.domain.Item;
import com.erp.domain.Quotation;
import com.erp.domain.QuotationLine;
import com.erp.domain.QuotationStatus;
import com.erp.dto.QuotationDtos.CreateQuotationRequest;
import com.erp.dto.QuotationDtos.QuotationResponse;
import com.erp.dto.QuotationDtos.QuoteLineRequest;
import com.erp.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.dto.SalesOrderDtos.OrderLineRequest;
import com.erp.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.QuotationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** 견적서: 작성/조회/상태전이, 수주(SalesOrder)로 전환. */
@Service
@RequiredArgsConstructor
public class QuotationService {

    private static final DateTimeFormatter DOC_DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final QuotationRepository quotationRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemRepository itemRepository;
    private final SalesOrderService salesOrderService;

    @Transactional(readOnly = true)
    public List<QuotationResponse> findAll() {
        return quotationRepository.findAllWithRefs().stream()
                .map(QuotationResponse::from)
                .toList();
    }

    @Transactional
    public QuotationResponse create(CreateQuotationRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 견적을 낼 수 없습니다: " + partner.getName());
        }
        boolean taxable = req.taxable() == null || req.taxable();
        LocalDate quoteDate = req.quoteDate() != null ? req.quoteDate() : LocalDate.now();

        Quotation q = Quotation.builder()
                .quoteNo(generateQuoteNo(quoteDate))
                .quoteDate(quoteDate)
                .validUntil(req.validUntil())
                .partner(partner)
                .status(QuotationStatus.DRAFT)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        for (QuoteLineRequest lr : req.lines()) {
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
            BigDecimal supply = lr.quantity().multiply(lr.unitPrice());
            BigDecimal vat = taxable ? supply.multiply(VAT_RATE) : BigDecimal.ZERO;
            q.addLine(QuotationLine.builder()
                    .item(item).quantity(lr.quantity()).unitPrice(lr.unitPrice())
                    .supplyAmount(supply).vatAmount(vat).build());
            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);
        }
        q.setSupplyAmount(totalSupply);
        q.setVatAmount(totalVat);
        q.setTotalAmount(totalSupply.add(totalVat));

        return QuotationResponse.from(quotationRepository.save(q));
    }

    /** 발송 처리 (작성 → 발송) */
    @Transactional
    public QuotationResponse markSent(Long id) {
        Quotation q = get(id);
        if (q.getStatus() != QuotationStatus.DRAFT) {
            throw ApiException.badRequest("작성 상태의 견적서만 발송할 수 있습니다.");
        }
        q.setStatus(QuotationStatus.SENT);
        return QuotationResponse.from(q);
    }

    @Transactional
    public QuotationResponse cancel(Long id) {
        Quotation q = get(id);
        if (q.getStatus() == QuotationStatus.CONVERTED) {
            throw ApiException.badRequest("이미 수주 전환된 견적서는 취소할 수 없습니다.");
        }
        q.setStatus(QuotationStatus.CANCELLED);
        return QuotationResponse.from(q);
    }

    /** 수주 전환: 견적 라인으로 SalesOrder 를 생성하고 견적을 CONVERTED 로 만든다. */
    @Transactional
    public SalesOrderResponse convertToOrder(Long id, String username) {
        Quotation q = get(id);
        if (q.getStatus() == QuotationStatus.CONVERTED) {
            throw ApiException.conflict("이미 수주 전환된 견적서입니다: " + q.getQuoteNo());
        }
        if (q.getStatus() == QuotationStatus.CANCELLED) {
            throw ApiException.badRequest("취소된 견적서는 전환할 수 없습니다.");
        }
        boolean taxable = q.getVatAmount().signum() > 0;
        List<OrderLineRequest> orderLines = q.getLines().stream()
                .map(l -> new OrderLineRequest(l.getItem().getId(), l.getQuantity(), l.getUnitPrice()))
                .toList();
        CreateSalesOrderRequest orderReq = new CreateSalesOrderRequest(
                q.getPartner().getId(), q.getQuoteDate(), q.getValidUntil(), taxable,
                "견적 " + q.getQuoteNo() + " 전환", orderLines);

        SalesOrderResponse order = salesOrderService.create(orderReq, username);
        q.setStatus(QuotationStatus.CONVERTED);
        q.setConvertedOrderId(order.id());
        return order;
    }

    private String generateQuoteNo(LocalDate date) {
        int seq = quotationRepository.maxSeq(date) + 1;
        return "QT-" + date.format(DOC_DATE) + "-" + String.format("%04d", seq);
    }

    private Quotation get(Long id) {
        return quotationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("견적서를 찾을 수 없습니다. id=" + id));
    }
}
