package com.erp.accounting.ledger.extrafield;

import java.util.List;

/** [추가항목등록] — 회사 공용 항목 8칸(고정, 원본 2026-10-13 실측). 1~3 코드형 · 4~5 문자형 · 6~7 숫자형 · 8 일자형. */
public final class ExtraFieldSlots {

    private ExtraFieldSlots() {}

    public record Slot(int no, String name, String kind, String setting) {}

    public static final List<Slot> ALL = List.of(
            new Slot(1, "추가항목1", "코드형", "등록"),
            new Slot(2, "추가항목2", "코드형", "등록"),
            new Slot(3, "추가항목3", "코드형", "등록"),
            new Slot(4, "추가항목4", "문자형", ""),
            new Slot(5, "추가항목5", "문자형", ""),
            new Slot(6, "추가항목6", "숫자형", "설정"),
            new Slot(7, "추가항목7", "숫자형", "설정"),
            new Slot(8, "추가항목8", "일자형", ""));
}
