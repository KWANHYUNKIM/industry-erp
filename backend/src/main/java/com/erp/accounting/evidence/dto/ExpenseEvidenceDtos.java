package com.erp.accounting.evidence.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 지출증빙현황(E030402) */
public final class ExpenseEvidenceDtos {

    private ExpenseEvidenceDtos() {}

    /** kinds = 증빙 열 차례(자료가 있는 증빙 + 늘 '증빙없음'). rows 의 amounts 는 그 이름을 키로. */
    public record StatusResponse(String from, String to, List<String> kinds, List<StatusRow> rows) {}

    public record StatusRow(Long accountId, String accountCode, String accountName,
                            Map<String, BigDecimal> amounts, BigDecimal total) {}

    /** 금액 링크 → 전표vs매출매입자료비교 한 줄. 매출매입자료가 없으면 오른쪽 칸은 비고 금액은 0. */
    public record CompareRow(Long entryId, LocalDate entryDate, String docNo, String accountName, String partnerName,
                             BigDecimal debit, BigDecimal credit,
                             String vatDocNo, String vatKind, String vatPartnerName,
                             BigDecimal supply, BigDecimal vat, BigDecimal vatTotal) {}

    /** [계정설정] 한 줄 — shown 이 인쇄방법 '표시'. */
    public record AccountSetting(Long id, String code, String name, boolean shown) {}

    public record AccountSettingRequest(List<Long> shownIds) {}
}
