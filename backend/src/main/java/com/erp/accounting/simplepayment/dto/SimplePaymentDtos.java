package com.erp.accounting.simplepayment.dto;

import com.erp.accounting.simplepayment.SimplePaymentKind;
import com.erp.accounting.simplepayment.SimplePaymentSubmitter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 간이지급명세서(E030116) */
public final class SimplePaymentDtos {

    private SimplePaymentDtos() {}

    public record StatementResponse(Long id, SimplePaymentKind kind, String kindName, int payYear, int period,
                                    LocalDate reportDate, String managerDept, String managerName, String managerPhone,
                                    SimplePaymentSubmitter submitter, String submitterName) {}

    public record StatementRequest(
            @NotNull SimplePaymentKind kind,
            @NotNull Integer payYear,
            @NotNull Integer period,
            @NotNull LocalDate reportDate,
            @NotBlank(message = "부서명을 입력바랍니다.") String managerDept,
            @NotBlank(message = "성명을 입력바랍니다.") String managerName,
            @NotBlank(message = "전화번호를 입력바랍니다.") String managerPhone,
            @NotNull SimplePaymentSubmitter submitter
    ) {}

    /** [조회] 서식 — 근로소득은 labor, 사업 · 기타소득은 payees 를 채운다. */
    public record SheetResponse(StatementResponse statement, List<LaborRow> labor, List<PayeeRow> payees,
                                List<DailyRow> daily) {}

    /** 일용근로소득 한 사람 — 근무월 · 근무일수 · 최종근무일 · 과세소득 · 세액(비과세는 출역에 없어 0). */
    public record DailyRow(String name, int days, LocalDate lastDate, BigDecimal taxable,
                           BigDecimal incomeTax, BigDecimal localIncomeTax) {}

    /** 근로소득 한 사람 — 근무기간과 반기 여섯 달의 급여 등(과세). */
    public record LaborRow(String employeeName, LocalDate workFrom, LocalDate workTo, List<BigDecimal> monthlyPay,
                           BigDecimal total) {}

    /** 사업 · 기타소득 한 소득자 — 그 달 기타원천세 지급을 소득자마다 묶는다. rate 는 % 정수. */
    public record PayeeRow(String payeeName, String payeeRegNo, int count, BigDecimal gross, BigDecimal expense,
                           BigDecimal taxable, int rate, BigDecimal incomeTax, BigDecimal localIncomeTax) {}
}
