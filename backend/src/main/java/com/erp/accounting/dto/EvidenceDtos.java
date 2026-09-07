package com.erp.accounting.dto;

import com.erp.accounting.domain.EvidenceAttachment;
import com.erp.accounting.domain.enums.EvidenceMethod;

import java.time.LocalDate;

public final class EvidenceDtos {

    private EvidenceDtos() {}

    /** 전표 종류 표시명(원본의 '메뉴' 컬럼) */
    public static String menuLabel(String entityType) {
        return switch (entityType == null ? "" : entityType) {
            case "SALES" -> "판매";
            case "PURCHASE" -> "구매";
            case "EXPENSE" -> "비용";
            default -> entityType;
        };
    }

    public record EvidenceResponse(
            Long id,
            String entityType, String menuLabel, Long entityId,
            String docNo, LocalDate docDate, LocalDate evidenceDate,
            EvidenceMethod method, String methodName,
            String worker, String note,
            Long fileId, String fileName, Long fileSize, boolean attached
    ) {
        public static EvidenceResponse from(EvidenceAttachment e) {
            boolean hasFile = e.getFile() != null;
            return new EvidenceResponse(
                    e.getId(),
                    e.getEntityType(), EvidenceDtos.menuLabel(e.getEntityType()), e.getEntityId(),
                    e.getDocNo(), e.getDocDate(), e.getEvidenceDate(),
                    e.getMethod(), e.getMethod().getDisplayName(),
                    e.getWorker(), e.getNote(),
                    hasFile ? e.getFile().getId() : null,
                    hasFile ? e.getFile().getName() : null,
                    hasFile ? e.getFile().getSizeBytes() : null,
                    hasFile);
        }
    }
}
