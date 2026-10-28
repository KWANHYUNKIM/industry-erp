package com.erp.trade.quotation;

import com.erp.trade.VatAllocator;
import com.erp.trade.TradeMasters;
import com.erp.trade.salesorder.SalesOrderService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.common.history.ChangeHistoryService;
import com.erp.common.history.ChangeHistoryService.SlipSnapshot;
import com.erp.trade.partner.BusinessPartner;
import com.erp.inventory.item.Item;
import com.erp.trade.quotation.dto.QuotationDtos.CreateQuotationRequest;
import com.erp.trade.quotation.dto.QuotationDtos.QuotationResponse;
import com.erp.trade.quotation.dto.QuotationDtos.QuoteLineRequest;
import com.erp.trade.salesorder.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.salesorder.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.hr.employee.EmployeeService;
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
    private final EmployeeService employeeService;
    private final SalesOrderService salesOrderService;
    private final DocumentNoGenerator docNoGenerator;
    private final ChangeHistoryService changeHistory;

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
                .employee(req.employeeId() == null ? null : employeeService.get(req.employeeId()))
                .status(QuotationStatus.IN_PROGRESS)
                .remark(req.remark())
                .createdBy(username)
                .build();

        fillLines(q, req.lines(), taxable);
        Quotation saved = quotationRepository.save(q);
        changeHistory.recordSlip(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED, snapshot(saved));
        return QuotationResponse.from(saved);
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
        q.setEmployee(req.employeeId() == null ? null : employeeService.get(req.employeeId()));
        q.setRemark(req.remark());
        q.getLines().clear();
        fillLines(q, req.lines(), req.taxable() == null || req.taxable());
        changeHistory.recordSlip(HISTORY_TARGET, q.getId(), ChangeHistoryService.UPDATED, snapshot(q));
        return QuotationResponse.from(q);
    }

    /** [H] · 거래이력조회(재고) 메뉴 '견적서' 의 대상 글자. */
    public static final String HISTORY_TARGET = "QUOTATION";

    /**
     * 행위 때 견적서 모습 — 원본 거래이력조회 '견적서' 줄(2026-10-21 실측: 행위 신규 · 수정 · 상태변경 …, 전표상태 '진행중' · '완료').
     * 담당자는 견적의 [담당자].
     */
    private static SlipSnapshot snapshot(Quotation q) {
        Item first = q.getLines().isEmpty() ? null : q.getLines().get(0).getItem();
        return new SlipSnapshot("견적서", q.getQuoteDate(), q.getQuoteNo(),
                q.getPartner() != null ? q.getPartner().getCode() : null,
                q.getPartner() != null ? q.getPartner().getName() : null,
                first == null ? null : ChangeHistoryService.itemSummary(q.getLines().get(0).effectiveItemName(), q.getLines().get(0).effectiveSpec(), q.getLines().size()),
                q.getEmployee() != null ? q.getEmployee().getCode() : null,
                q.getEmployee() != null ? q.getEmployee().getName() : null,
                q.getStatus() != null ? q.getStatus().getDisplayName() : null);
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
                    .supplyAmount(supply).vatAmount(vat).remark(lr.remark())
                    .itemName(item.getName())
                    .spec(lr.spec() != null ? lr.spec() : item.getSpec()).build());
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
        boolean changed = q.getStatus() != status;
        q.setStatus(status);
        if (changed) changeHistory.recordSlip(HISTORY_TARGET, q.getId(), ChangeHistoryService.STATUS_CHANGED, snapshot(q));
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
                l.getItem().getCode(), l.effectiveItemName(), l.effectiveSpec(),
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

    /**
     * 원본 [다른전표생성] › 주문서 › 1장라인별(2026-10-14 원본에서 저장까지 실측): 고른 견적으로 '주문서입력' 창을 채워 띄우고,
     * 사람이 [저장(F8)] 을 눌러야 주문서가 생긴다. 창에서 고친 값이 {@code req} 다. 만든 주문서는 진행중,
     * 견적은 진행상태 그대로(진행중)이고 [생성한전표] 에 그 주문서가 걸린다 — 주문서를 지우면 풀린다.
     */
    @Transactional
    public SalesOrderResponse convertToOrder(List<Long> ids, CreateSalesOrderRequest req, String username) {
        List<Quotation> quotes = ids.stream().distinct().map(this::get).toList();
        for (Quotation q : quotes) {
            // 원본은 이미 만든 견적을 다시 1장라인별로 해도 막지 않는다(2026-10-21 실측) — 새 주문서에 다시 건다.
            if (q.getStatus() == QuotationStatus.CANCELLED) {
                throw ApiException.badRequest("취소된 견적서는 전환할 수 없습니다.");
            }
        }
        SalesOrderResponse order = salesOrderService.create(req, username);
        quotes.forEach(q -> q.setConvertedOrderId(order.id()));
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
        changeHistory.recordSlip(HISTORY_TARGET, q.getId(), ChangeHistoryService.DELETED, snapshot(q));
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
