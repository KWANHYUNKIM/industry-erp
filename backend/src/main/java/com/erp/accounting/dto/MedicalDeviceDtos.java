package com.erp.accounting.dto;

import com.erp.accounting.domain.MedicalDeviceReport;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public final class MedicalDeviceDtos {

    private MedicalDeviceDtos() {}

    /**
     * 공급내역 한 줄. 공급구분은 우리 데이터에 실제로 존재하는 두 가지만 낸다 —
     * <b>출고</b>(판매 라인) · <b>폐기</b>(재고조정 폐기). 반품·임대·회수는 해당 전표 종류가 없어 산출하지 않는다.
     */
    public record SupplyLine(
            LocalDate supplyDate,
            String supplyType,       // OUT(출고) / DISPOSAL(폐기)
            String supplyTypeName,
            String docNo,
            String udiDi,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity,
            Long partnerId, String partnerName, String partnerBizRegNo
    ) {}

    /** 송신이력(=보고파일 산출 이력) */
    public record ReportResponse(
            Long id, String reportMonth,
            LocalDate periodFrom, LocalDate periodTo,
            int lineCount, BigDecimal totalQty,
            Long fileId, String fileName, Long fileSize,
            String createdBy, LocalDateTime createdAt
    ) {
        public static ReportResponse from(MedicalDeviceReport r) {
            boolean hasFile = r.getFile() != null;
            return new ReportResponse(
                    r.getId(), r.getReportMonth(), r.getPeriodFrom(), r.getPeriodTo(),
                    r.getLineCount(), r.getTotalQty(),
                    hasFile ? r.getFile().getId() : null,
                    hasFile ? r.getFile().getName() : null,
                    hasFile ? r.getFile().getSizeBytes() : null,
                    r.getCreatedBy(), r.getCreatedAt());
        }
    }
}
