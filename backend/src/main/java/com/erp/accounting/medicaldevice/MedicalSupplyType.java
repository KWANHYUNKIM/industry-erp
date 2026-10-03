package com.erp.accounting.medicaldevice;

/** 원본 의료기기공급내역보고입력의 [공급구분코드] 라디오 다섯(2026-10-03 실측). */
public enum MedicalSupplyType {
    OUT("출고"), RETURN("반품"), DISPOSAL("폐기"), RENTAL("임대"), RECALL("회수");

    private final String label;

    MedicalSupplyType(String label) { this.label = label; }

    public String label() { return label; }
}
