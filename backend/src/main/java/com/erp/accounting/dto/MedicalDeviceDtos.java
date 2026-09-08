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
            Long partnerId, String partnerName, String partnerBizRegNo,
            /**
             * 공급받는 자의 <b>[공급형태]</b> — 거래처에 정해 둔 값이다(원본 조건이자 보고 서식의 항목).
             * 폐기는 공급받는 자가 없어 늘 null 이다.
             */
            String supplyShape,
            /**
             * 품목의 <b>구분·그룹</b> — 원본 의료기기공급내역보고(E040231)의 조건이다
             * (2026-09-09 원본 실측: [품목구분]·[품목그룹1]).
             *
             * <p>품목 마스터가 진작 들고 있는 값인데 이 줄만 안 싣고 있어서, 화면은
             * 품목을 <b>하나씩만</b> 고를 수 있었다. 의료기기 보고는 "이 구분/그룹의
             * 품목이 이 달에 얼마나 나갔나" 를 보는 일이 잦다.
             */
            String itemCategoryName,
            String itemGroupName
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
