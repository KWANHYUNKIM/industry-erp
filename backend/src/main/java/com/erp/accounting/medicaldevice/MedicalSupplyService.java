package com.erp.accounting.medicaldevice;

import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryLineRequest;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryLineResponse;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryRequest;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryResponse;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryRow;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.SaleCandidate;
import com.erp.common.ApiException;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.item.dto.ItemDtos.ItemResponse;
import com.erp.trade.sales.SalesService;
import com.erp.trade.sales.dto.SalesDtos.SalesLineResponse;
import com.erp.trade.sales.dto.SalesDtos.SalesResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 의료기기공급내역보고(C001403) — 보고 줄을 저장한다(원본 입력 · 수정 창).
 * 판매에서 불러올 수 있는 줄은 <b>품목에 UDI-DI 가 있고 판매 줄에 시리얼/로트가 있는</b> 줄이며, 한 번만 보고한다.
 */
@Service
@RequiredArgsConstructor
public class MedicalSupplyService {

    /** 원본 알림 그대로(2026-10-03 loginaa 실측). */
    static final String NOTHING_TO_PULL =
            "시리얼(UDI)이 등록된 모든 내역이 저장되었거나 불러올 내역이 없습니다. 확인 후 다시 시도 바랍니다.";

    private final MedicalSupplyEntryRepository repository;
    private final SalesService salesService;
    private final ItemService itemService;

    @Transactional(readOnly = true)
    public List<EntryRow> list(LocalDate from, LocalDate to, Boolean transmitted) {
        List<EntryRow> rows = new ArrayList<>();
        for (MedicalSupplyEntry e : repository.findWithLines(from, to)) {
            if (transmitted != null && e.isTransmitted() != transmitted) continue;
            String docNo = MedicalSupplyDtos.docNo(e.getEntryDate(), e.getEntrySeq());
            for (MedicalSupplyEntryLine l : e.getLines()) {
                rows.add(new EntryRow(e.getId(), l.getId(), e.getEntryDate(), docNo, e.getReportMonth(),
                        e.getSupplyType(), e.getSupplyType().label(), e.getSupplyShape(),
                        l.getPartnerName(), l.getItemName(), l.getUdi(), l.getQuantity(),
                        e.isTransmitted(), e.isTransmitted() ? "전송" : "미전송", e.getTransmittedAt(),
                        l.getDeliveryDate(), l.getPartnerId(), l.getItemId(), e.getUpdatedAt()));
            }
        }
        return rows;
    }

    @Transactional(readOnly = true)
    public EntryResponse get(Long id) {
        return EntryResponse.from(find(id));
    }

    /** 판매검색창 — 기간 안의 판매 전표. [불러온전표] 표시는 화면이 한다. */
    @Transactional(readOnly = true)
    public List<SaleCandidate> sales(LocalDate from, LocalDate to) {
        return salesService.findAll(from, to).stream()
                .sorted((a, b) -> b.saleDate().compareTo(a.saleDate()) != 0
                        ? b.saleDate().compareTo(a.saleDate()) : b.docNo().compareTo(a.docNo()))
                .map(s -> new SaleCandidate(s.id(), s.saleDate(), s.docNo(), s.partnerName(),
                        summary(s.lines()), s.totalAmount(), s.warehouseName(), s.accountingReflected(),
                        s.confirmStatus() == null ? null : s.confirmStatus().name(), s.confirmStatusName()))
                .toList();
    }

    /**
     * 고른 판매에서 보고할 줄을 만든다 — 저장은 하지 않는다(입력 창 격자에 채울 뿐).
     * 남은 줄이 하나도 없으면 원본처럼 막는다.
     */
    @Transactional(readOnly = true)
    public List<EntryLineResponse> pull(List<Long> saleIds, Long exceptEntryId) {
        Map<Long, String> udiByItem = itemService.findAll().stream()
                .filter(i -> StringUtils.hasText(i.udiDi()))
                .collect(Collectors.toMap(ItemResponse::id, ItemResponse::udiDi));
        Set<Long> want = new HashSet<>(saleIds == null ? List.of() : saleIds);
        List<SalesResponse> sales = salesService.findAll().stream().filter(s -> want.contains(s.id())).toList();
        List<Long> lineIds = sales.stream().flatMap(s -> s.lines().stream()).map(SalesLineResponse::lineId).toList();
        Set<Long> done = lineIds.isEmpty() ? Set.of() : new HashSet<>(repository.reportedSalesLines(lineIds, exceptEntryId));

        List<EntryLineResponse> out = new ArrayList<>();
        for (SalesResponse s : sales) {
            for (SalesLineResponse l : s.lines()) {
                String udi = udiByItem.get(l.itemId());
                if (udi == null || !StringUtils.hasText(l.lotNo()) || done.contains(l.lineId())) continue;
                BigDecimal amount = l.supplyAmount() == null ? BigDecimal.ZERO : l.supplyAmount();
                out.add(new EntryLineResponse(null, out.size() + 1, l.lineId(),
                        MedicalSupplyDtos.docNo(s.saleDate(), seqOf(s.docNo())),
                        "(01)" + udi + "(10)" + l.lotNo().trim(), s.saleDate(), false, null,
                        s.partnerId(), s.partnerName(), false, l.itemId(), l.itemName(),
                        l.quantity(), l.unitPrice() == null ? BigDecimal.ZERO : l.unitPrice(), amount));
            }
        }
        if (out.isEmpty()) throw ApiException.badRequest(NOTHING_TO_PULL);
        return out;
    }

    @Transactional
    public EntryResponse create(EntryRequest req, String user) {
        LocalDate today = LocalDate.now();
        MedicalSupplyEntry e = MedicalSupplyEntry.builder()
                .entryDate(today)
                .entrySeq(repository.maxSeq(today) + 1)
                .createdBy(user)
                .build();
        apply(e, req);
        return EntryResponse.from(repository.save(e));
    }

    @Transactional
    public EntryResponse update(Long id, EntryRequest req) {
        MedicalSupplyEntry e = find(id);
        apply(e, req);
        repository.flush();
        return EntryResponse.from(e);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(find(id));
    }

    private void apply(MedicalSupplyEntry e, EntryRequest req) {
        try {
            YearMonth.parse(req.reportMonth());
        } catch (RuntimeException ex) {
            throw ApiException.badRequest("보고기준월 형식이 올바르지 않습니다(yyyy-MM): " + req.reportMonth());
        }
        List<Long> salesLineIds = req.lines().stream().map(EntryLineRequest::salesLineId)
                .filter(x -> x != null).toList();
        if (salesLineIds.size() != new HashSet<>(salesLineIds).size()
                || (!salesLineIds.isEmpty() && !repository.reportedSalesLines(salesLineIds, e.getId()).isEmpty())) {
            throw ApiException.conflict(NOTHING_TO_PULL);
        }
        e.setReportMonth(req.reportMonth());
        e.setSupplyType(req.supplyType());
        e.setSupplyShape(req.supplyShape());
        /*
         * 줄을 비운 것을 <b>먼저 DB 에 내보낸다</b>. 안 그러면 Hibernate 가 새 줄 INSERT 를 지운 줄 DELETE 보다
         * 먼저 내보내, 같은 판매 줄을 그대로 다시 저장하는 수정이 sales_line_id UNIQUE 에 걸려 늘 실패했다.
         */
        e.getLines().clear();
        if (e.getId() != null) repository.flush();
        int no = 0;
        for (EntryLineRequest r : req.lines()) {
            BigDecimal price = r.unitPrice() == null ? BigDecimal.ZERO : r.unitPrice();
            e.getLines().add(MedicalSupplyEntryLine.builder()
                    .entry(e)
                    .lineNo(++no)
                    .salesLineId(r.salesLineId())
                    .sourceDocNo(r.sourceDocNo())
                    .udi(r.udi())
                    .deliveryDate(r.deliveryDate())
                    .used(r.used())
                    .partnerSystemCode(r.partnerSystemCode())
                    .partnerId(r.partnerId())
                    .partnerName(r.partnerName())
                    .differentPlace(r.differentPlace())
                    .itemId(r.itemId())
                    .itemName(r.itemName())
                    .quantity(r.quantity())
                    .unitPrice(price)
                    /* 금액은 서버가 단가 × 수량으로 매긴다 — 화면이 보낸 금액과 어긋나도 장부가 하나로 맞는다. */
                    .amount(price.multiply(r.quantity()).setScale(2, java.math.RoundingMode.HALF_UP))
                    .build());
        }
    }

    private MedicalSupplyEntry find(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("의료기기공급내역보고를 찾을 수 없습니다. id=" + id));
    }

    private static String summary(List<SalesLineResponse> lines) {
        if (lines.isEmpty()) return "";
        String first = lines.get(0).itemName();
        return lines.size() == 1 ? first : first + " 외 " + (lines.size() - 1) + "건";
    }

    /** 판매 전표번호 끝의 일련번호 — 'S-20260923-0001' 이면 1. 못 읽으면 1. */
    private static int seqOf(String docNo) {
        if (docNo == null) return 1;
        String digits = docNo.replaceAll(".*?(\\d+)$", "$1");
        try {
            return Integer.parseInt(digits.length() > 4 ? digits.substring(digits.length() - 4) : digits);
        } catch (NumberFormatException ex) {
            return 1;
        }
    }
}
