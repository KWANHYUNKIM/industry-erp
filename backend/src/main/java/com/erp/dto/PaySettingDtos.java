package com.erp.dto;

import com.erp.domain.PayGroup;
import com.erp.domain.PayItem;
import com.erp.domain.PayrollTransfer;
import com.erp.domain.PayslipLineKind;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 급여 설정(수당·공제 항목/그룹)과 급여이체 */
public final class PaySettingDtos {

    private PaySettingDtos() {}

    // ── 수당·공제 항목 ────────────────────────────────────────────────

    public record PayItemRequest(
            @NotBlank(message = "항목코드를 입력하세요.") String code,
            @NotBlank(message = "항목명을 입력하세요.") String name,
            @NotNull(message = "수당/공제를 선택하세요.") PayslipLineKind kind,
            /** 비과세 수당(식대 등)이면 false. 공제 항목에서는 쓰지 않는다. */
            Boolean taxable,
            @PositiveOrZero(message = "기본금액은 0보다 작을 수 없습니다.") BigDecimal defaultAmount,
            Boolean active
    ) {}

    public record PayItemResponse(
            Long id, String code, String name,
            PayslipLineKind kind, String kindName,
            boolean taxable, BigDecimal defaultAmount, boolean active
    ) {
        public static PayItemResponse from(PayItem i) {
            return new PayItemResponse(
                    i.getId(), i.getCode(), i.getName(),
                    i.getKind(), i.getKind().getDisplayName(),
                    i.isTaxable(), i.getDefaultAmount(), i.isActive());
        }
    }

    // ── 수당/공제 그룹 ────────────────────────────────────────────────

    public record GroupLineInput(
            @NotNull(message = "항목을 선택하세요.") Long payItemId,
            /** 비우면 항목 기본금액 */
            @PositiveOrZero(message = "금액은 0보다 작을 수 없습니다.") BigDecimal amount
    ) {}

    public record PayGroupRequest(
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            String remark,
            Boolean active,
            @NotEmpty(message = "항목을 1개 이상 넣으세요.") @Valid List<GroupLineInput> lines
    ) {}

    public record GroupLineResponse(
            Long payItemId, String code, String name,
            PayslipLineKind kind, String kindName, boolean taxable, BigDecimal amount
    ) {}

    public record PayGroupResponse(
            Long id, String name, String remark, boolean active,
            BigDecimal allowanceTotal, BigDecimal deductionTotal,
            List<GroupLineResponse> lines
    ) {
        public static PayGroupResponse from(PayGroup g) {
            List<GroupLineResponse> lines = g.getLines().stream()
                    .map(l -> new GroupLineResponse(
                            l.getPayItem().getId(), l.getPayItem().getCode(), l.getPayItem().getName(),
                            l.getPayItem().getKind(), l.getPayItem().getKind().getDisplayName(),
                            l.getPayItem().isTaxable(), l.resolveAmount()))
                    .toList();
            BigDecimal allowance = lines.stream()
                    .filter(l -> l.kind() == PayslipLineKind.ALLOWANCE)
                    .map(GroupLineResponse::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal deduction = lines.stream()
                    .filter(l -> l.kind() == PayslipLineKind.DEDUCTION)
                    .map(GroupLineResponse::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new PayGroupResponse(g.getId(), g.getName(), g.getRemark(), g.isActive(),
                    allowance, deduction, lines);
        }
    }

    // ── 급여이체 ──────────────────────────────────────────────────────

    public record TransferRequest(
            @NotBlank(message = "귀속월(yyyy-MM)을 입력하세요.") String payMonth,
            @NotNull(message = "출금할 회사 계좌를 선택하세요.") Long bankAccountId,
            LocalDate transferDate,
            /** 비우면 해당 월의 확정·미이체 급여명세 전체 */
            List<Long> payslipIds
    ) {}

    public record TransferLineResponse(
            Long payslipId, Long employeeId, String employeeName, String department, BigDecimal netPay) {}

    public record TransferResponse(
            Long id, String transferNo, String payMonth, LocalDate transferDate,
            Long bankAccountId, String bankAccountName,
            BigDecimal totalPay, BigDecimal totalDeduction, BigDecimal netPay,
            Long journalEntryId, String journalDocNo,
            String createdBy, List<TransferLineResponse> lines
    ) {
        public static TransferResponse from(PayrollTransfer t) {
            return new TransferResponse(
                    t.getId(), t.getTransferNo(), t.getPayMonth(), t.getTransferDate(),
                    t.getBankAccount().getId(),
                    t.getBankAccount().getBankName() + " " + t.getBankAccount().getAccountNo(),
                    t.getTotalPay(), t.getTotalDeduction(), t.getNetPay(),
                    t.getJournalEntry() != null ? t.getJournalEntry().getId() : null,
                    t.getJournalEntry() != null ? t.getJournalEntry().getDocNo() : null,
                    t.getCreatedBy(),
                    t.getLines().stream()
                            .map(l -> new TransferLineResponse(
                                    l.getPayslip().getId(),
                                    l.getPayslip().getEmployee().getId(),
                                    l.getPayslip().getEmployee().getName(),
                                    l.getPayslip().getEmployee().getDepartment() != null
                                            ? l.getPayslip().getEmployee().getDepartment().getName() : null,
                                    l.getNetPay()))
                            .toList());
        }
    }
}
