package com.erp.accounting.dto;

import com.erp.accounting.domain.PromissoryNote;
import com.erp.groupware.domain.enums.NoteStatus;
import com.erp.groupware.domain.enums.NoteType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class PromissoryNoteDtos {

    private PromissoryNoteDtos() {}

    /** 어음 수취(받을어음) / 발행(지급어음) */
    public record CreateNoteRequest(
            @NotNull(message = "어음 구분을 선택하세요.") NoteType type,
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            LocalDate issueDate,
            @NotNull(message = "만기일을 입력하세요.") LocalDate dueDate,
            @NotNull @Positive(message = "어음 금액은 0보다 커야 합니다.") BigDecimal amount,
            String bankName,
            String remark
    ) {}

    /** 만기결제. 예금계좌를 지정하지 않으면 보통예금(103)으로 분개한다. */
    public record SettleRequest(
            Long bankAccountId,
            LocalDate settleDate
    ) {}

    /** 어음할인(받을어음 전용). 할인료는 매출채권처분손실로 잡는다. */
    public record DiscountRequest(
            Long bankAccountId,
            LocalDate discountDate,
            @NotNull @PositiveOrZero(message = "할인료는 0 이상이어야 합니다.") BigDecimal discountFee
    ) {}

    /** 부도(받을어음 전용). 어음채권을 외상매출금으로 되돌린다. */
    public record DishonorRequest(LocalDate dishonorDate) {}

    public record NoteResponse(
            Long id, String noteNo,
            NoteType type, String typeName,
            Long partnerId, String partnerName,
            LocalDate issueDate, LocalDate dueDate, BigDecimal amount,
            NoteStatus status, String statusName,
            LocalDate closedDate, BigDecimal discountFee,
            String bankName, String remark, String createdBy
    ) {
        public static NoteResponse from(PromissoryNote n) {
            return new NoteResponse(
                    n.getId(), n.getNoteNo(),
                    n.getType(), n.getType().getDisplayName(),
                    n.getPartner().getId(), n.getPartner().getName(),
                    n.getIssueDate(), n.getDueDate(), n.getAmount(),
                    n.getStatus(), n.getStatus().getDisplayName(),
                    n.getClosedDate(), n.getDiscountFee(),
                    n.getBankName(), n.getRemark(), n.getCreatedBy());
        }
    }

    /** 어음현황 요약: 보유 중인 어음의 잔액과 만기도래분 */
    public record NoteSummary(
            BigDecimal receivableHeld,
            BigDecimal payableHeld,
            BigDecimal receivableDueSoon,
            BigDecimal payableDueSoon,
            List<NoteResponse> notes
    ) {}
}
