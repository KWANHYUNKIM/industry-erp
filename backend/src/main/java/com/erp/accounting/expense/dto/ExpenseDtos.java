package com.erp.accounting.expense.dto;

import com.erp.accounting.expense.Expense;
import com.erp.accounting.expense.ExpensePayType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class ExpenseDtos {

    private ExpenseDtos() {}

    public record CreateExpenseRequest(
            /** 옛 지출 등록(계정을 바로 고름). 비용코드(expenseItemId)를 주면 비워도 된다 — 계정은 비용 마스터의 것. */
            Long accountId,
            LocalDate expenseDate,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String content,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String partnerName,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            /** 부가세(매입세액). 안 주면 0 — 세금계산서 없는 비용. 낸 돈 = amount + vatAmount(46회차). */
            @PositiveOrZero(message = "부가세는 0 이상이어야 합니다.") BigDecimal vatAmount,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String paymentMethod,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String department,
            /** 귀속 프로젝트 (선택) */
            Long projectId,
            /** 원본 [사용일자] — 비면 기준일자와 같은 날. */
            LocalDate useDate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remarks,
            /** 원본 [결제구분] — 개인비용 · 회사비용. 비면 정하지 않은 것. */
            ExpensePayType payType,
            /** 원본 비용내역입력 줄 [비용코드](E060812). 주면 저장 때 분개하지 않는다(전표별회계반영 E060814 에서 가지급금정산서로). */
            Long expenseItemId,
            /** 줄 [사원] — 비용코드가 있으면 필수. */
            Long employeeId,
            /** 머리 [비용그룹] */
            Long expenseGroupId
    ) {}

    /**
     * 전표별회계반영(비용) E060814 [가지급금정산서작성] → 창 [저장(F8)]. 개인비용 전표만 받는다.
     * 줄의 정산자 이름은 화면이 사원 목록에서 붙여 보낸다(accounting 은 hr 엔티티를 새로 참조하지 않는다).
     */
    public record SettleRequest(
            @jakarta.validation.constraints.NotEmpty(message = "리스트에 선택된 자료가 없습니다.") java.util.List<SettleLine> lines,
            LocalDate voucherDate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description
    ) {}

    public record SettleLine(@NotNull Long expenseId, String employeeName) {}

    /**
     * 비용내역입력(E060812) 전표 한 장 = 머리 + 줄 여럿. 원본(2026-10-20 실측): 두 줄 20,000 + 15,000 을 한 번에 저장하면
     * 전표 하나 '2026/10/20 -2' 가 되고, 전표별회계반영에서 그 한 장이 가지급금정산서 한 장이 된다.
     */
    public record SlipRequest(
            LocalDate expenseDate,
            Long expenseGroupId,
            ExpensePayType payType,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remarks,
            /** 머리 [출금계좌] */
            Long bankAccountId,
            @jakarta.validation.constraints.NotEmpty(message = "비용코드를 입력 바랍니다.")
            java.util.List<@jakarta.validation.Valid SlipLine> lines,
            /** 비용통제 알림 '한도금액이 초과되었습니다. 전표를 저장하겠습니까?' 에 [확인] 했으면 true */
            Boolean confirmOverLimit
    ) {}

    public record SlipLine(
            LocalDate useDate,
            @NotNull(message = "비용코드를 입력 바랍니다.") Long expenseItemId,
            @NotNull(message = "사원: 자료를 입력 바랍니다.") Long employeeId,
            @Size(max = 200) String partnerName,
            @NotNull(message = "사용금액을 입력 바랍니다.") @Positive(message = "사용금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 300) String content,
            @Size(max = 50) String department,
            Long projectId,
            BigDecimal allocAmount, BigDecimal amount1, BigDecimal amount2,
            @Size(max = 200) String memo1, @Size(max = 200) String memo2, @Size(max = 200) String memo3
    ) {}

    /**
     * 비용통제 창 한 줄 — 원본 '1.비용' 표 [비용코드 · 비용명 · 사용인원 · 사용자] (사용인원 체크) 또는 한도 체크.
     * 사원 이름은 화면이 사원 목록에서 붙인다(accounting 은 hr 엔티티를 새로 참조하지 않는다).
     */
    public record ControlViolation(String kind, String itemCode, String itemName,
                                   java.util.List<Long> allowedEmployeeIds, Long employeeId,
                                   BigDecimal limitAmount, BigDecimal usedAmount, boolean block) {}

    public record ExpenseResponse(
            Long id,
            /** 비용 전표번호. 원본 비용내역현황의 [일자-No.] 가 이 값이다. */
            String docNo,
            LocalDate expenseDate,
            Long accountId, String accountName,
            /**
             * 원본 [비용그룹명]. 우리에겐 비용그룹 마스터가 없어 계정과목의 세부분류로 갈음한다 —
             * 없으면 계정구분(판매관리비 등)을 쓴다. 없는 마스터를 지어내지 않는다.
             */
            String accountGroupName,
            String content, String partnerName,
            /** 거래처 마스터와 이름이 정확히 일치할 때만 채워진다(아니면 null) */
            Long partnerId,
            BigDecimal amount,
            /** 부가세(매입세액) · 낸 돈(amount + vatAmount) */
            BigDecimal vatAmount, BigDecimal totalAmount,
            String paymentMethod, String department,
            Long projectId, String projectName,
            String createdBy,
            /** 원본 [사용일자] — 전표에 없으면 기준일자. */
            LocalDate useDate,
            String remarks,
            ExpensePayType payType, String payTypeName,
            /** 비용 마스터(비용코드 · 비용명) — 옛 지출은 null */
            Long expenseItemId, String expenseItemCode, String expenseItemName,
            Long employeeId,
            Long expenseGroupId, String expenseGroupCode, String expenseGroupName,
            /** 가지급금정산서(회계전표) id — 전표별회계반영이 채운다. null 이면 회계 반영 전. */
            Long settledJournalId,
            /** 계정코드 — 전표별회계반영 창 [계정코드(차변)] */
            String accountCode,
            /** 전표 번호(같은 값 = 한 전표의 줄) · 줄 차례 */
            String slipDocNo, Integer lineNo,
            BigDecimal allocAmount, BigDecimal amount1, BigDecimal amount2,
            String memo1, String memo2, String memo3,
            Long bankAccountId
    ) {
        public static ExpenseResponse from(Expense e) {
            String group = e.getAccount().getDetailCategory();
            if (group == null || group.isBlank()) {
                group = e.getAccount().getDivision() != null
                        ? e.getAccount().getDivision().getDisplayName() : null;
            }
            return new ExpenseResponse(
                    e.getId(), e.getDocNo(), e.getExpenseDate(),
                    e.getAccount().getId(), e.getAccount().getName(),
                    group,
                    e.getContent(), e.getPartnerName(),
                    e.getPartner() != null ? e.getPartner().getId() : null,
                    e.getAmount(), e.getVatAmount(), e.getAmount().add(e.getVatAmount()),
                    e.getPaymentMethod(), e.getDepartment(),
                    e.getProject() != null ? e.getProject().getId() : null,
                    e.getProject() != null ? e.getProject().getName() : null,
                    e.getCreatedBy(),
                    e.getUseDate() != null ? e.getUseDate() : e.getExpenseDate(),
                    e.getRemarks(),
                    e.getPayType(), e.getPayType() != null ? e.getPayType().getDisplayName() : null,
                    e.getExpenseItem() != null ? e.getExpenseItem().getId() : null,
                    e.getExpenseItem() != null ? e.getExpenseItem().getCode() : null,
                    e.getExpenseItem() != null ? e.getExpenseItem().getName() : null,
                    e.getEmployeeId(),
                    e.getExpenseGroup() != null ? e.getExpenseGroup().getId() : null,
                    e.getExpenseGroup() != null ? e.getExpenseGroup().getCode() : null,
                    e.getExpenseGroup() != null ? e.getExpenseGroup().getName() : null,
                    e.getSettledJournalId(),
                    e.getAccount().getCode(),
                    e.getSlipDocNo() != null ? e.getSlipDocNo() : e.getDocNo(),
                    e.getLineNo() != null ? e.getLineNo() : 1,
                    e.getAllocAmount(), e.getAmount1(), e.getAmount2(),
                    e.getMemo1(), e.getMemo2(), e.getMemo3(),
                    e.getBankAccountId());
        }
    }
}
