package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.accounting.domain.Currency;
import com.erp.trade.domain.ExportOrder;
import com.erp.trade.domain.ExportOrderLine;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.enums.ExportStatus;
import com.erp.accounting.dto.CurrencyDtos.ConversionResponse;
import com.erp.trade.dto.ExportDtos.CreateExportRequest;
import com.erp.trade.dto.ExportDtos.CustomsRequest;
import com.erp.trade.dto.ExportDtos.ExportLineRequest;
import com.erp.trade.dto.ExportDtos.ExportResponse;
import com.erp.trade.dto.ExportDtos.ExportSummary;
import com.erp.trade.dto.ExportDtos.PayRequest;
import com.erp.trade.dto.ExportDtos.ShipRequest;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.accounting.repository.CurrencyRepository;
import com.erp.trade.repository.ExportOrderRepository;
import com.erp.inventory.repository.ItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.CurrencyDtos;
import com.erp.accounting.service.CurrencyService;
import com.erp.trade.dto.ExportDtos;

/**
 * 수출관리: 인보이스 발행 → 통관진행 → 선적완료 → 입금완료.
 *
 * 금액은 외화가 원본이고, 원화는 발행일 고시환율로 환산해 전표에 박아둔다. 볼 때마다 환산하면
 * 어제 본 금액과 오늘 본 금액이 달라져 세관·회계와 어긋난다. 환산은 CurrencyService 가 소유한다
 * (고시단위·직전 고시 적용 규칙이 그쪽에 있다).
 *
 * 단계는 건너뛰거나 되돌릴 수 없다. 선적 안 한 건이 입금완료로 넘어가면 미선적 잔액이 사라진다.
 */
@Service
@RequiredArgsConstructor
public class ExportService {

    private final ExportOrderRepository exportRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final CurrencyRepository currencyRepository;
    private final ItemRepository itemRepository;
    private final CurrencyService currencyService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public ExportSummary findAll() {
        List<ExportOrder> all = exportRepository.findAllWithRefs();

        BigDecimal totalKrw = BigDecimal.ZERO;
        BigDecimal unpaidKrw = BigDecimal.ZERO;
        long orderCount = 0;
        long shippingCount = 0;
        long unpaidCount = 0;

        for (ExportOrder e : all) {
            totalKrw = totalKrw.add(e.getKrwAmount());
            if (e.getStatus() != ExportStatus.PAID) {
                unpaidKrw = unpaidKrw.add(e.getKrwAmount());
                unpaidCount++;
            }
            if (e.getStatus() == ExportStatus.ORDER) orderCount++;
            if (e.getStatus() == ExportStatus.CUSTOMS || e.getStatus() == ExportStatus.SHIPPED) shippingCount++;
        }

        return new ExportSummary(totalKrw, unpaidKrw, orderCount, shippingCount, unpaidCount,
                all.stream().map(ExportResponse::from).toList());
    }

    /** 인보이스 발행. 외화 합계를 발행일 고시환율로 원화 환산해 고정한다. */
    @Transactional
    public ExportResponse create(CreateExportRequest req, String username) {
        BusinessPartner buyer = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (!buyer.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 수출할 수 없습니다: " + buyer.getName());
        }
        Currency currency = currencyRepository.findById(req.currencyId())
                .orElseThrow(() -> ApiException.notFound("통화를 찾을 수 없습니다. id=" + req.currencyId()));
        LocalDate invoiceDate = req.invoiceDate() != null ? req.invoiceDate() : LocalDate.now();

        ExportOrder e = ExportOrder.builder()
                .invoiceNo(docNoGenerator.next("INV-", "export_orders", "invoice_no", "invoice_date", invoiceDate))
                .invoiceDate(invoiceDate)
                .buyer(buyer)
                .currency(currency)
                .incoterms(req.incoterms())
                .destination(req.destination())
                .status(ExportStatus.ORDER)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal foreignTotal = BigDecimal.ZERO;
        for (ExportLineRequest lr : req.lines()) {
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
            BigDecimal amount = lr.quantity().multiply(lr.unitPrice());
            e.addLine(ExportOrderLine.builder()
                    .item(item).quantity(lr.quantity()).unitPrice(lr.unitPrice()).amount(amount).build());
            foreignTotal = foreignTotal.add(amount);
        }

        // 원화 환산: 고시단위·직전 고시 적용 규칙은 CurrencyService 가 소유한다.
        ConversionResponse converted = currencyService.convert(currency.getId(), foreignTotal, invoiceDate);
        e.setForeignAmount(foreignTotal);
        e.setAppliedRate(converted.appliedRate());
        e.setKrwAmount(converted.krwAmount());

        return ExportResponse.from(exportRepository.save(e));
    }

    /** 통관진행: 수출신고번호 기록 */
    @Transactional
    public ExportResponse customs(Long id, CustomsRequest req) {
        ExportOrder e = advance(id, ExportStatus.CUSTOMS);
        e.setDeclarationNo(req.declarationNo());
        return ExportResponse.from(e);
    }

    /** 선적완료: B/L 번호와 선적일 기록 */
    @Transactional
    public ExportResponse ship(Long id, ShipRequest req) {
        ExportOrder e = advance(id, ExportStatus.SHIPPED);
        e.setBlNo(req.blNo());
        e.setShippedDate(req.shippedDate() != null ? req.shippedDate() : LocalDate.now());
        return ExportResponse.from(e);
    }

    /** 입금완료 */
    @Transactional
    public ExportResponse pay(Long id, PayRequest req) {
        ExportOrder e = advance(id, ExportStatus.PAID);
        e.setPaidDate(req != null && req.paidDate() != null ? req.paidDate() : LocalDate.now());
        return ExportResponse.from(e);
    }

    /** 다음 단계로만 넘어간다. 건너뛰기·되돌리기·같은 단계 반복을 모두 막는다. */
    private ExportOrder advance(Long id, ExportStatus next) {
        ExportOrder e = exportRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수출 인보이스를 찾을 수 없습니다. id=" + id));
        if (!next.isNextOf(e.getStatus())) {
            throw ApiException.badRequest(String.format(
                    "%s 은(는) %s 다음 단계가 아닙니다. 현재: %s (%s)",
                    next.getDisplayName(), e.getStatus().getDisplayName(),
                    e.getStatus().getDisplayName(), e.getInvoiceNo()));
        }
        e.setStatus(next);
        return e;
    }
}
