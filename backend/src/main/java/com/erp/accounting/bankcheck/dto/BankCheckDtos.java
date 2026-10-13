package com.erp.accounting.bankcheck.dto;

import com.erp.accounting.bankcheck.BankCheck;
import com.erp.accounting.bankcheck.CheckStatus;
import com.erp.accounting.bankcheck.CheckType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class BankCheckDtos {

    private BankCheckDtos() {}

    public record CreateCheckRequest(
            @NotNull(message = "수표 종류를 선택하세요.") CheckType type,
            @Size(max = 30, message = "수표번호는 30자까지 넣을 수 있습니다.")
            @NotBlank(message = "수표번호를 입력하세요.") String checkNo,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            LocalDate issueDate,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String bankName,
            Long partnerId,
            /** 발행수표는 끊어 줄 당좌계좌가 필수 */
            Long bankAccountId,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 받은수표 입금: 어느 계좌에 넣을지 */
    public record DepositRequest(
            @NotNull(message = "입금할 계좌를 선택하세요.") Long bankAccountId,
            LocalDate depositDate
    ) {}

    public record SettleRequest(LocalDate settledDate) {}

    /**
     * 원본 수령(발행)수표내역입력 — 머리(전표일자 · 전표구분 증가/감소 · 거래처 · 수표계좌) + 줄(수표번호 · 금액 · 적요).
     * 분개 없이 수표만 늘리고 줄인다.
     */
    public record DirectEntryRequest(
            @NotNull(message = "수표 종류를 선택하세요.") CheckType type,
            @NotNull(message = "전표일자를 입력하세요.") LocalDate date,
            boolean increase,
            Long partnerId,
            @NotNull(message = "수표계좌를 선택하세요.") Long bankAccountId,
            @jakarta.validation.constraints.NotEmpty(message = "수표번호를 입력하세요.")
            java.util.List<@jakarta.validation.Valid DirectLine> lines
    ) {}

    public record DirectLine(
            @Size(max = 30, message = "수표번호는 30자까지 넣을 수 있습니다.")
            @NotBlank(message = "수표번호를 입력하세요.") String checkNo,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /**
     * 수표조회 [일자-No.] 링크로 연 수표내역입력 전표를 고쳐 저장 — 전표일자 · 전표구분은 막히고(2026-10-13 원본 실측) 거래처 · 수표계좌 · 줄을 고친다.
     * 줄의 id 는 이미 있는 수표, 없으면 새로 더한 줄. 전표에 있던 수표가 빠지면 그 움직임을 지운다.
     */
    public record DirectEditRequest(
            @NotNull(message = "수표 종류를 선택하세요.") CheckType type,
            @NotNull(message = "전표일자를 입력하세요.") LocalDate date,
            boolean increase,
            @NotNull Integer entryNo,
            Long partnerId,
            @NotNull(message = "수표계좌를 선택하세요.") Long bankAccountId,
            @jakarta.validation.constraints.NotEmpty(message = "수표번호를 입력하세요.")
            java.util.List<@jakarta.validation.Valid DirectEditLine> lines
    ) {}

    public record DirectEditLine(
            Long id,
            @Size(max = 30, message = "수표번호는 30자까지 넣을 수 있습니다.")
            @NotBlank(message = "수표번호를 입력하세요.") String checkNo,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /**
     * 원본 수령수표입금처리(E060602) [입금보고서작성] → 입금보고서 [저장] — 머리(일자 · 입금계좌 · 첨언내용) + 고른 수표마다 한 줄(적요명).
     * 입금계좌를 비우고 cash 가 참이면 000 현금.
     */
    public record DepositReportRequest(
            @NotNull(message = "일자를 입력하세요.") LocalDate date,
            Long bankAccountId,
            Boolean cash,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String description,
            @jakarta.validation.constraints.NotEmpty(message = "저장할 내용이 없습니다.")
            java.util.List<@jakarta.validation.Valid DepositReportLine> lines
    ) {}

    public record DepositReportLine(
            @NotNull(message = "수표를 고르세요.") Long checkId,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String memo
    ) {}

    /** 수령(발행)수표조회 [선택삭제] — 고른 줄의 수표 id 를 감소 · 증가로 나눠 보낸다. */
    public record DeleteMovesRequest(java.util.List<Long> decreaseIds, java.util.List<Long> increaseIds) {}

    public record CheckResponse(
            Long id, String checkNo, CheckType type, String typeName,
            CheckStatus status, String statusName,
            LocalDate issueDate, BigDecimal amount, String bankName,
            Long partnerId, String partnerName,
            Long bankAccountId, String bankAccountName,
            LocalDate settledDate, String remark, String createdBy, String updatedBy,
            /* 원본 거래유형 '수표만증가' · '수표만감소' — 수표내역입력에서 분개 없이 넣은 수표 */
            boolean directEntry,
            /* 원본 수령수표증가 · 감소현황의 [일자-No.] — 받을 때 · 손을 떠날 때 회계전표 번호. 목록에서만 채운다. */
            String issueJournalNo, String settleJournalNo,
            /* 수표내역입력 전표 번호 — 원본 [일자] '2026/10/13 -5' 의 5. 늘린 전표 · 줄인 전표. */
            Integer directInNo, Integer directOutNo,
            /* 입금보고서(수령수표입금처리)로 손을 떠난 수표 — 원본 수령수표조회 거래유형 '입금보고서', 그 감소 줄은 체크칸이 막힌다. */
            boolean settledByVoucher
    ) {
        public static CheckResponse from(BankCheck c) {
            return from(c, null, null, false);
        }

        public static CheckResponse from(BankCheck c, String issueJournalNo, String settleJournalNo) {
            return from(c, issueJournalNo, settleJournalNo, false);
        }

        public static CheckResponse from(BankCheck c, String issueJournalNo, String settleJournalNo, boolean settledByVoucher) {
            return new CheckResponse(
                    c.getId(), c.getCheckNo(), c.getType(), c.getType().getDisplayName(),
                    c.getStatus(), c.getStatus().getDisplayName(),
                    c.getIssueDate(), c.getAmount(), c.getBankName(),
                    c.getPartner() != null ? c.getPartner().getId() : null,
                    c.getPartner() != null ? c.getPartner().getName() : null,
                    c.getBankAccount() != null ? c.getBankAccount().getId() : null,
                    c.getBankAccount() != null
                            ? c.getBankAccount().getBankName() + " " + c.getBankAccount().getAccountNo() : null,
                    c.getSettledDate(), c.getRemark(), c.getCreatedBy(), c.getUpdatedBy(), c.isDirectEntry(), issueJournalNo, settleJournalNo,
                    c.getDirectInNo(), c.getDirectOutNo(), settledByVoucher);
        }
    }
}
