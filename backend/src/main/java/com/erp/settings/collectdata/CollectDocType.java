package com.erp.settings.collectdata;

/**
 * 수집데이터등록의 [수신문서] — 원본 수신문서검색 팝업이 띄우는 셋(구분1 영업관리 · 구매관리).
 * 거래처가 이메일로 보낸 이 문서를 받아 각 …수집조회 화면에 모은다.
 */
public enum CollectDocType {
    STATEMENT("거래명세서", "영업관리", "거래명세서수집"),
    QUOTATION("견적서", "영업관리", "견적서수집"),
    PURCHASE_ORDER("발주서", "구매관리", "발주서수집");

    private final String label;
    private final String group;
    /** 기본 줄의 [연결업무] — 그 문서를 모으는 …수집조회 화면. */
    private final String linkedTask;

    CollectDocType(String label, String group, String linkedTask) {
        this.label = label;
        this.group = group;
        this.linkedTask = linkedTask;
    }

    public String label() { return label; }
    public String group() { return group; }
    public String linkedTask() { return linkedTask; }
}
