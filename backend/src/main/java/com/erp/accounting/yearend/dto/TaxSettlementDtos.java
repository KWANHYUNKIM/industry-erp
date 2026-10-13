package com.erp.accounting.yearend.dto;

import com.erp.accounting.yearend.TaxDataSource;
import com.erp.accounting.yearend.TaxDeductionKind;
import com.erp.accounting.yearend.TaxSettlementKind;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class TaxSettlementDtos {

    private TaxSettlementDtos() {}

    /**
     * 주(현)근무지 한 해 급여 — hr 이 확정 급여명세에서 모아 넘긴다(accounting 은 급여명세를 다시 세지 않는다).
     * nonTaxable 은 <b>한도 안의</b> 비과세(급여계산 과세급여와 같은 규칙), 건강보험은 장기요양 포함.
     */
    public record CurrentPay(long totalPay, long nonTaxable, long nationalPension, long healthInsurance,
                             long employmentInsurance, long incomeTax, long localTax) {
        public static final CurrentPay NONE = new CurrentPay(0, 0, 0, 0, 0, 0, 0);
    }

    public record PrevEmployerRequest(String bizNo, String companyName, LocalDate periodFrom, LocalDate periodTo,
                                      Long salary, Long bonus, Long otherPay, Long nonTaxable, Long reducedIncome,
                                      Long nationalPension, Long otherPension, Long healthInsurance, Long employmentInsurance,
                                      Long decidedIncomeTax, Long decidedLocalTax, Long decidedRuralTax) {}

    public record DeductionRequest(TaxDeductionKind kind, String targetName, String relation, TaxDataSource dataSource,
                                   Boolean unlimited, Long amount, Integer receiptCount) {}

    public record PrevEmployerResponse(Long id, int lineNo, String bizNo, String companyName, LocalDate periodFrom,
                                       LocalDate periodTo, long salary, long bonus, long otherPay, long taxablePay,
                                       long nonTaxable, long reducedIncome, long nationalPension, long otherPension,
                                       long healthInsurance, long employmentInsurance, long decidedIncomeTax,
                                       long decidedLocalTax, long decidedRuralTax) {}

    public record DeductionResponse(Long id, int lineNo, TaxDeductionKind kind, String targetName, String relation,
                                    TaxDataSource dataSource, boolean unlimited, long amount, Integer receiptCount) {}

    /** 정산 한 건 — 목록 줄 + 원천징수영수증 칸. 사원 이름은 화면이 사원 목록에서 붙인다(employeeId). */
    public record SettlementResponse(
            Long id, int attributionYear, Long employeeId, TaxSettlementKind kind, String withholdingMonth,
            boolean standardAuto, boolean childCredit, boolean singleRate, int basicDeductionCount, String memo,
            LocalDateTime calculatedAt,
            long totalPay, long totalSalary, long earnedIncomeDeduction, long earnedIncomeAmount, long incomeDeductionTotal,
            long taxBase, long computedTax, long taxReduction, long taxCreditTotal, long standardTaxCredit,
            long decidedIncomeTax, long decidedLocalTax, long decidedRuralTax,
            long prevIncomeTax, long prevLocalTax, long currentIncomeTax, long currentLocalTax,
            long balanceIncomeTax, long balanceLocalTax,
            List<PrevEmployerResponse> prevEmployers, List<DeductionResponse> deductions) {}
}
