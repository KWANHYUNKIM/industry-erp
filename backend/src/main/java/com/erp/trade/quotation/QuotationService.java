package com.erp.trade.quotation;

import com.erp.trade.VatAllocator;
import com.erp.trade.TradeMasters;
import com.erp.trade.salesorder.SalesOrderService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.inventory.item.Item;
import com.erp.trade.quotation.dto.QuotationDtos.CreateQuotationRequest;
import com.erp.trade.quotation.dto.QuotationDtos.QuotationResponse;
import com.erp.trade.quotation.dto.QuotationDtos.QuoteLineRequest;
import com.erp.trade.salesorder.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.salesorder.dto.SalesOrderDtos.OrderLineRequest;
import com.erp.trade.salesorder.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.warehouse.WarehouseService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import com.erp.trade.quotation.dto.QuotationDtos;
import com.erp.trade.salesorder.dto.SalesOrderDtos;

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
                .status(QuotationStatus.IN_PROGRESS)
                .remark(req.remark())
                .createdBy(username)
                .build();

        fillLines(q, req.lines(), taxable);
        return QuotationResponse.from(quotationRepository.save(q));
    }

    /**
     * 견적서수정 — 원본은 [일자-No.] 를 누르면 같은 입력 창이 자료를 든 채 열리고 [저장(F8)] 으로 고친다
     * (2026-10-14 실측: 하단 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · H · 최종이력).
     * 번호(일자-No.)와 진행상태는 그대로 두고, 머리 칸과 줄을 통째로 바꾼다.
     */
    @Transactional
    public QuotationResponse update(Long id, CreateQuotationRequest req) {
        Quotation q = get(id);
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 견적을 낼 수 없습니다: " + partner.getName());
        }
        q.setPartner(partner);
        if (req.quoteDate() != null) q.setQuoteDate(req.quoteDate());
        q.setValidUntil(req.validUntil());
        q.setWarehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()));
        q.setProject(req.projectId() == null ? null : projectService.get(req.projectId()));
        q.setRemark(req.remark());
        q.getLines().clear();
        fillLines(q, req.lines(), req.taxable() == null || req.taxable());
        return QuotationResponse.from(q);
    }

    private void fillLines(Quotation q, List<QuoteLineRequest> lines, boolean taxable) {
        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        for (QuoteLineRequest lr : lines) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal supply = VatAllocator.lineSupply(lr.quantity(), lr.unitPrice());
            // 원 단위로 반올림한다 — 수주서(SalesOrderService)와 같은 규칙. 안 하면 777원 줄의 부가세가
            // 77.7 로 저장돼 미주문현황·견적서에 소수가 찍히고, 수주로 전환하면 78 이 되어 금액이 어긋났다.
            BigDecimal vat = taxable ? supply.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            q.addLine(QuotationLine.builder()
                    .item(item).quantity(lr.quantity()).unitPrice(lr.unitPrice())
                    .supplyAmount(supply).vatAmount(vat).build());
            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);
        }
        q.setSupplyAmount(totalSupply);
        q.setVatAmount(totalVat);
        q.setTotalAmount(totalSupply.add(totalVat));
    }

    /**
     * 하단 [진행상태변경] — 원본 메뉴 '▾미확인 › 미확인', '▾확인 › 진행중 · 완료'(2026-10-14 견적서조회 실측).
     * 고른 줄을 그 상태로 옮기고 말 없이 목록이 바뀐다. 취소는 고를 수 없다(원본에 없다).
     */
    @Transactional
    public QuotationResponse updateStatus(Long id, QuotationStatus status) {
        if (status == null || status == QuotationStatus.CANCELLED) {
            throw ApiException.badRequest("진행상태는 미확인 · 진행중 · 완료 중에서 고릅니다.");
        }
        Quotation q = get(id);
        q.setStatus(status);
        return QuotationResponse.from(q);
    }

    /**
     * 줄의 [생성한전표] '조회' — 이 견적에서 만든 주문서. 견적 줄마다 한 줄, 주문서로 넘어갔으면 그 일자-No.
     * 우리 견적은 통째로 한 번 전환하므로 잔량은 넘어갔으면 0, 아니면 견적 수량이다.
     */
    @Transactional(readOnly = true)
    public List<QuotationDtos.GeneratedSlipRow> generatedSlips(Long id) {
        Quotation q = get(id);
        SalesOrderResponse order = q.getConvertedOrderId() == null ? null : salesOrderService.findOne(q.getConvertedOrderId());
        return q.getLines().stream().map(l -> new QuotationDtos.GeneratedSlipRow(
                l.getItem().getCode(), l.getItem().getName(), l.getItem().getSpec(),
                l.getQuantity(), order == null ? l.getQuantity() : BigDecimal.ZERO,
                order == null ? null : "주문서",
                order == null ? null : order.orderDate(),
                order == null ? null : order.orderNo())).toList();
    }

    @Transactional
    public QuotationResponse cancel(Long id) {
        Quotation q = get(id);
        if (q.getConvertedOrderId() != null) {
            throw ApiException.badRequest("이미 수주 전환된 견적서는 취소할 수 없습니다.");
        }
        q.setStatus(QuotationStatus.CANCELLED);
        return QuotationResponse.from(q);
    }

    /** 수주 전환(원본 [다른전표생성] › 주문서): 견적 라인으로 SalesOrder 를 생성하고 견적에 그 주문을 잇는다. */
    @Transactional
    public SalesOrderResponse convertToOrder(Long id, String username) {
        Quotation q = get(id);
        if (q.getConvertedOrderId() != null) {
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
        /*
         * 수주일은 <b>전환한 날</b>이다 — 주문은 견적을 받아들인 날 생긴다. 예전엔 견적일을 그대로 써서
         * 9/25 견적을 10/2 에 전환하면 수주가 9/25 로, 번호도 SN-20260925-… 로 앞 날짜에 끼어들었다
         * (30회차 — 이미 닫은 달 장부에 주문이 새로 생긴다). 견적의 [유효기한] 은 "이 값에 언제까지 팔겠다" 이지
         * 납기가 아니어서 수주 납기로 옮기지 않는다 — 납기는 수주에서 정한다.
         */
        CreateSalesOrderRequest orderReq = new CreateSalesOrderRequest(
                q.getPartner().getId(), LocalDate.now(), null,
                q.getWarehouse() != null ? q.getWarehouse().getId() : null,
                q.getProject() != null ? q.getProject().getId() : null,
                null,
                taxable, "견적 " + q.getQuoteNo() + " 전환", orderLines);

        SalesOrderResponse order = salesOrderService.create(orderReq, username);
        /* 진행상태는 그대로 둔다 — 원본은 주문서를 만들어도 견적이 '진행중' 이다(2026-10-14 실측). */
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
