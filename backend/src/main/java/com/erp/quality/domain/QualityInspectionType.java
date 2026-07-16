package com.erp.quality.domain;

/**
 * 품질검사 구분.
 */
public enum QualityInspectionType {
    INCOMING("수입검사"),
    PROCESS("공정검사"),
    SHIPMENT("출하검사");

    private final String displayName;

    QualityInspectionType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
