package com.erp.accounting.medicaldevice.dto;

import com.erp.accounting.medicaldevice.MedicalSupplyEntry;
import com.erp.accounting.medicaldevice.MedicalSupplyEntryLine;
import com.erp.accounting.medicaldevice.MedicalSupplyType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** 의료기기공급내역보고(C001403) — 저장하는 보고 줄. */
public final class MedicalSupplyDtos {

    private MedicalSupplyDtos() {}

    private static final DateTimeFormatter SLASH = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    /** 원본 [전표일자-No.] '2026/09/23 -1' */
    public static String docNo(LocalDate d, int seq) {
        return d.format(SLASH) + " -" + seq;
    }

    public record EntryLineRequest(
            Long salesLineId,
            @Size(max = 40) String sourceDocNo,
            @Size(max = 120) String udi,
            LocalDate deliveryDate,
            boolean used,
            @Size(max = 50) String partnerSystemCode,
            Long partnerId,
            @Size(max = 100) String partnerName,
            boolean differentPlace,
            Long itemId,
            @Size(max = 200) String itemName,
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal amount
    ) {}

    public record EntryRequest(
            @NotBlank(message = "보고기준월을 고르세요.") @Size(max = 7) String reportMonth,
            @NotNull(message = "공급구분코드를 고르세요.") MedicalSupplyType supplyType,
            @NotBlank(message = "공급형태코드를 고르세요.") @Size(max = 30) String supplyShape,
            @NotEmpty(message = "보고할 줄이 없습니다.") List<@Valid EntryLineRequest> lines
    ) {}

    public record EntryLineResponse(
            Long id, int lineNo, Long salesLineId, String sourceDocNo, String udi,
            LocalDate deliveryDate, boolean used, String partnerSystemCode,
            Long partnerId, String partnerName, boolean differentPlace,
            Long itemId, String itemName, BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount
    ) {
        public static EntryLineResponse from(MedicalSupplyEntryLine l) {
            return new EntryLineResponse(l.getId(), l.getLineNo(), l.getSalesLineId(), l.getSourceDocNo(),
                    l.getUdi(), l.getDeliveryDate(), l.isUsed(), l.getPartnerSystemCode(),
                    l.getPartnerId(), l.getPartnerName(), l.isDifferentPlace(),
                    l.getItemId(), l.getItemName(), l.getQuantity(), l.getUnitPrice(), l.getAmount());
        }
    }

    public record EntryResponse(
            Long id, LocalDate entryDate, int entrySeq, String docNo, String reportMonth,
            MedicalSupplyType supplyType, String supplyTypeName, String supplyShape,
            boolean transmitted, LocalDateTime transmittedAt, String createdBy,
            List<EntryLineResponse> lines
    ) {
        public static EntryResponse from(MedicalSupplyEntry e) {
            return new EntryResponse(e.getId(), e.getEntryDate(), e.getEntrySeq(),
                    docNo(e.getEntryDate(), e.getEntrySeq()), e.getReportMonth(),
                    e.getSupplyType(), e.getSupplyType().label(), e.getSupplyShape(),
                    e.isTransmitted(), e.getTransmittedAt(), e.getCreatedBy(),
                    e.getLines().stream().map(EntryLineResponse::from).toList());
        }
    }

    /** 목록 한 줄 — 원본 목록은 보고 <b>줄</b> 단위다. */
    public record EntryRow(
            Long entryId, Long lineId, LocalDate entryDate, String docNo, String reportMonth,
            MedicalSupplyType supplyType, String supplyTypeName, String supplyShape,
            String partnerName, String itemName, String udi, BigDecimal quantity,
            boolean transmitted, String transmitStatus, LocalDateTime transmittedAt
    ) {}

    /** 판매검색창 한 줄 — 원본 열: 일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 거래유형명 · 창고명 · 회계반영여부. */
    public record SaleCandidate(
            Long saleId, LocalDate saleDate, String docNo, String partnerName, String itemSummary,
            BigDecimal totalAmount, String warehouseName, boolean accountingReflected,
            String confirmStatus, String confirmStatusName
    ) {}
}
