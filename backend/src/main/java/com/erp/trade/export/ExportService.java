package com.erp.trade.export;

import com.erp.trade.TradeMasters;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.settings.currency.Currency;
import com.erp.inventory.item.Item;
import com.erp.settings.currency.dto.CurrencyDtos.ConversionResponse;
import com.erp.trade.export.dto.ExportDtos.CreateExportRequest;
import com.erp.trade.export.dto.ExportDtos.CustomsRequest;
import com.erp.trade.export.dto.ExportDtos.ExportLineRequest;
import com.erp.trade.export.dto.ExportDtos.ExportResponse;
import com.erp.trade.export.dto.ExportDtos.ExportSummary;
import com.erp.trade.export.dto.ExportDtos.PayRequest;
import com.erp.trade.export.dto.ExportDtos.ShipRequest;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.inventory.item.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.settings.currency.dto.CurrencyDtos;
import com.erp.settings.currency.CurrencyService;
import com.erp.trade.export.dto.ExportDtos;

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
    private final ItemService itemService;
    private final CurrencyService currencyService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public ExportSummary findAll() {
        return findAll(null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     *
     * <p>안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 로 쓰면
     * PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public ExportSummary findAll(java.time.LocalDate from, java.time.LocalDate to) {
        List<ExportOrder> all = exportRepository.findAllWithRefs(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31));

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
        LocalDate invoiceDate = req.invoiceDate() != null ? req.invoiceDate() : LocalDate.now();
        String invoiceNo = req.invoiceNo() != null && !req.invoiceNo().isBlank() ? req.invoiceNo().trim()
                : docNoGenerator.next("INV-", "export_orders", "invoice_no", "invoice_date", invoiceDate);
        if (exportRepository.existsByInvoiceNo(invoiceNo)) {
            throw ApiException.badRequest("이미 쓰고 있는 Invoice 번호입니다: " + invoiceNo);
        }
        ExportOrder e = ExportOrder.builder()
                .invoiceNo(invoiceNo)
                .status(ExportStatus.ORDER)
                .createdBy(username)
                .build();
        apply(e, req);
        return ExportResponse.from(exportRepository.save(e));
    }

    /** 원본 Invoice/Packing List 수정 — 머리와 품목 줄을 통째로 바꾼다(줄은 지우고 다시 단다). */
    @Transactional
    public ExportResponse update(Long id, CreateExportRequest req) {
        ExportOrder e = get(id);
        if (req.invoiceNo() != null && !req.invoiceNo().isBlank()) {
            if (exportRepository.existsByInvoiceNoAndIdNot(req.invoiceNo().trim(), id)) {
                throw ApiException.badRequest("이미 쓰고 있는 Invoice 번호입니다: " + req.invoiceNo().trim());
            }
            e.setInvoiceNo(req.invoiceNo().trim());
        }
        e.getLines().clear();
        exportRepository.flush();
        apply(e, req);
        return ExportResponse.from(e);
    }

    @Transactional
    public void delete(Long id) {
        exportRepository.delete(get(id));
    }

    /** 원본 [진행상태변경] — 미확인 ↔ 확인. */
    @Transactional
    public ExportResponse confirm(Long id, boolean confirmed) {
        ExportOrder e = get(id);
        e.setConfirmed(confirmed);
        return ExportResponse.from(e);
    }

    private ExportOrder get(Long id) {
        return exportRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수출 전표를 찾을 수 없습니다. id=" + id));
    }

    /** 머리 · 품목 줄을 요청 그대로 채우고 외화 합계 · 원화 환산을 다시 셈한다. */
    private void apply(ExportOrder e, CreateExportRequest req) {
        BusinessPartner buyer = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        if (!buyer.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 수출할 수 없습니다: " + buyer.getName());
        }
        Currency currency = currencyService.get(req.currencyId());
        LocalDate invoiceDate = req.invoiceDate() != null ? req.invoiceDate() : LocalDate.now();
        e.setInvoiceDate(invoiceDate);
        e.setVoucherDate(req.voucherDate() != null ? req.voucherDate() : invoiceDate);
        e.setBuyer(buyer);
        e.setCurrency(currency);
        e.setIncoterms(req.incoterms());
        e.setDestination(req.destination());
        e.setRemark(req.remark());
        e.setLcNo(req.lcNo());
        e.setLcDate(req.lcDate());
        e.setLcBank(req.lcBank());
        e.setShipper(req.shipper());
        e.setMessrs(req.messrs());
        e.setNotifyParty(req.notifyParty());
        e.setPortOfLoading(req.portOfLoading());
        e.setCarrier(req.carrier());
        e.setSailingDate(req.sailingDate());
        e.setWeightUnit(req.weightUnit());

        BigDecimal foreignTotal = BigDecimal.ZERO;
        for (ExportLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal amount = lr.quantity().multiply(lr.unitPrice());
            e.addLine(ExportOrderLine.builder()
                    .item(item).quantity(lr.quantity()).unitPrice(lr.unitPrice()).amount(amount)
                    .unit(lr.unit()).marks(lr.marks()).description(lr.description())
                    .netWeight(lr.netWeight()).grossWeight(lr.grossWeight()).measurement(lr.measurement())
                    .build());
            foreignTotal = foreignTotal.add(amount);
        }

        // 원화 환산: 고시단위·직전 고시 적용 규칙은 CurrencyService 가 소유한다.
        ConversionResponse converted = currencyService.convert(currency.getId(), foreignTotal, invoiceDate);
        e.setForeignAmount(foreignTotal);
        e.setAppliedRate(converted.appliedRate());
        e.setKrwAmount(converted.krwAmount());
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
