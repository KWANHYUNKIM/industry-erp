package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.Quotation;
import com.erp.trade.domain.QuotationLine;
import com.erp.trade.domain.QuotationStatus;
import com.erp.trade.dto.QuotationDtos.CreateQuotationRequest;
import com.erp.trade.dto.QuotationDtos.QuotationResponse;
import com.erp.trade.dto.QuotationDtos.QuoteLineRequest;
import com.erp.trade.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.dto.SalesOrderDtos.OrderLineRequest;
import com.erp.trade.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.QuotationRepository;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.WarehouseService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.QuotationDtos;
import com.erp.trade.dto.SalesOrderDtos;

/** 견적서: 작성/조회/상태전이, 수주(SalesOrder)로 전환. */
@Service
@RequiredArgsConstructor
public class QuotationService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final QuotationRepository quotationRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    /* 다른 모듈의 값은 그 모듈이 공개한 service 를 거친다(CLAUDE.md 4.2). */
    private final WarehouseService warehouseService;
    private final ProjectService projectService;
    private final SalesOrderService salesOrderService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<QuotationResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<QuotationResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? quotationRepository.findAllWithRefs()
                : quotationRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream()
                .map(QuotationResponse::from)
                .toList();
    }

    @Transactional
    public QuotationResponse create(CreateQuotationRequest req, String username) {
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
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
                .warehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .status(QuotationStatus.DRAFT)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        for (QuoteLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
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
        /*
         * <b>견적에서 정한 창고·프로젝트를 수주로 넘긴다.</b> 이것이 이 두 칸을 만든 까닭이다 —
         * 견적 → 수주 → 판매로 이어질 때 맨 앞에서 정한 것이 <b>중간에 끊기면</b>
         * 같은 것을 다시 골라야 하고, 프로젝트별 손익에서도 수주 단계가 빠진다.
         */
        CreateSalesOrderRequest orderReq = new CreateSalesOrderRequest(
                q.getPartner().getId(), q.getQuoteDate(), q.getValidUntil(),
                q.getWarehouse() != null ? q.getWarehouse().getId() : null,
                q.getProject() != null ? q.getProject().getId() : null,
                null,
                taxable, "견적 " + q.getQuoteNo() + " 전환", orderLines);

        SalesOrderResponse order = salesOrderService.create(orderReq, username);
        q.setStatus(QuotationStatus.CONVERTED);
        q.setConvertedOrderId(order.id());
        return order;
    }

    /**
     * 견적서 삭제.
     *
     * <p>지금까지 삭제가 아예 없었다. 거래처나 단가를 잘못 넣은 견적서를 지울 방법이 없어
     * 취소로 덮어 두는 수밖에 없었고, 목록이 죽은 문서로 계속 불어났다.
     *
     * <p>수주로 전환된 견적서는 막는다 — 수주가 그 견적서를 출처로 가리키고 있어서
     * 지우면 수주의 근거가 사라진다. 그 경우 수주를 먼저 지워야 한다.
     */
    @Transactional
    public void delete(Long id) {
        Quotation q = get(id);
        if (q.getConvertedOrderId() != null) {
            throw ApiException.conflict(
                    "수주로 전환된 견적서는 지울 수 없습니다. 먼저 수주를 지우세요: " + q.getQuoteNo());
        }
        quotationRepository.delete(q);
    }

    private String generateQuoteNo(LocalDate date) {
        return docNoGenerator.next("QT-", "quotations", "quote_no", "quote_date", date);
    }

    private Quotation get(Long id) {
        return quotationRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("견적서를 찾을 수 없습니다. id=" + id));
    }
}
