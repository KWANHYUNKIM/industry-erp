package com.erp.hr.dto;

import com.erp.hr.domain.Payslip;
import com.erp.hr.domain.PayslipLine;
import com.erp.hr.domain.PayslipLineKind;
import com.erp.hr.domain.PayslipStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public final class PayrollDtos {

    private PayrollDtos() {}

    /** 수당/공제 수동 항목 입력 */
    public record LineInput(
            @NotNull PayslipLineKind kind,
            @NotBlank String name,
            @NotNull BigDecimal amount,
            /** 비과세 수당(식대 등)이면 false. 비우면 과세로 본다. */
            Boolean taxable
    ) {}

    /** 급여명세 생성/재계산 요청 */
    public record CreatePayslipRequest(
            @NotNull(message = "사원을 선택하세요.") Long employeeId,
            @NotBlank(message = "귀속월(YYYY-MM)을 입력하세요.") String payMonth,
            /** 미지정 시 사원 마스터의 기본급을 쓴다. */
            BigDecimal baseSalary,
            /** 수당/공제 그룹. 지정하면 그룹의 항목들이 명세 라인으로 들어간다. */
            Long payGroupId,
            /** 그룹에 없는 이번 달만의 수당·수동공제. 4대보험은 서버가 자동 추가한다. */
            List<LineInput> lines,
            String remark
    ) {}

    public record PayslipLineResponse(
            Long id, int lineNo, PayslipLineKind kind, String kindName,
            String name, BigDecimal amount, boolean auto, boolean taxable
    ) {
        public static PayslipLineResponse from(PayslipLine l) {
            return new PayslipLineResponse(l.getId(), l.getLineNo(), l.getKind(),
                    l.getKind().getDisplayName(), l.getName(), l.getAmount(), l.isAuto(), l.isTaxable());
        }
    }

    public record PayslipResponse(
            Long id, Long employeeId, String employeeCode, String employeeName, String department,
            String payMonth,
            BigDecimal baseSalary, BigDecimal allowanceTotal, BigDecimal deductionTotal,
            BigDecimal grossPay, BigDecimal netPay,
            PayslipStatus status, String statusName, String remark,
            List<PayslipLineResponse> lines
    ) {
        public static PayslipResponse from(Payslip p) {
            return new PayslipResponse(
                    p.getId(), p.getEmployee().getId(), p.getEmployee().getCode(),
                    p.getEmployee().getName(),
                    p.getEmployee().getDepartment() != null ? p.getEmployee().getDepartment().getName() : "",
                    p.getPayMonth(),
                    p.getBaseSalary(), p.getAllowanceTotal(), p.getDeductionTotal(),
                    p.grossPay(), p.getNetPay(),
                    p.getStatus(), p.getStatus().getDisplayName(), p.getRemark(),
                    p.getLines().stream().map(PayslipLineResponse::from).toList());
        }
    }
}
