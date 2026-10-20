package com.erp.accounting.promissorynote.dto;

import com.erp.accounting.promissorynote.PromissoryNote;
import com.erp.accounting.promissorynote.NoteStatus;
import com.erp.accounting.promissorynote.NoteType;
import jakarta.validation.constraints.Size;
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
            @NotNull(message = "어음 금액을 입력하세요.") @Positive(message = "어음 금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bankName,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark,
            /** 원본 [내역만등록] — 회계전표 없이 내역만. */
            Boolean recordOnly,
            /** [어음번호] — 받을어음증가 · 내역만등록 모두 사람이 적는다. 비우면 서버가 매긴다. */
            @Size(max = 30, message = "어음번호는 30자까지 넣을 수 있습니다.")
            String noteNo,
            /** 원본 받을어음증가 · [내역만등록] 의 [부서] · [프로젝트] */
            Long departmentId,
            Long projectId
    ) {}

    /**
     * 원본 [내역만등록] 전표구분 [감소] — 받아 둔(발행한) 어음을 분개 없이 닫는다.
     * 격자 [어음번호 · 금액 · 부서 · 프로젝트 · 적요] 중 어음번호로 어음을 찾는다.
     */
    public record RecordDecreaseRequest(
            @NotNull(message = "어음 구분을 선택하세요.") NoteType type,
            @NotNull(message = "어음번호: 자료를 입력 바랍니다.") @Size(max = 30, message = "어음번호는 30자까지 넣을 수 있습니다.") String noteNo,
            LocalDate date,
            /** 감소 줄의 적요 · 부서 · 프로젝트(증가 쪽 값과 따로) */
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String remark,
            Long departmentId,
            Long projectId
    ) {}

    /**
     * 받을어음감소(E010602) 한 장 — 원본 칸 [전표일자 · 부서 · 프로젝트 · 입금계좌 · 어음번호 · 총금액 · 금액 · 수수료 · 적요].
     * 총금액 = 금액 + 수수료 = 그 어음 금액. 빈 입금계좌 · 어음번호는 원본처럼 화면이 칸을 빨갛게 막는다.
     */
    public record DecreaseRequest(
            @NotNull(message = "어음번호: 자료를 입력 바랍니다.") @Size(max = 30, message = "어음번호는 30자까지 넣을 수 있습니다.") String noteNo,
            @NotNull(message = "입금계좌: 자료를 입력 바랍니다.") Long bankAccountId,
            LocalDate date,
            @NotNull(message = "금액: 자료를 입력 바랍니다.") @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount,
            @PositiveOrZero(message = "수수료는 0 이상이어야 합니다.") BigDecimal fee,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String remark,
            Long departmentId,
            Long projectId
    ) {}

    /**
     * 받을어음거래처지급(E010603) 한 장 — 원본 칸 [전표일자 · 부서 · 프로젝트 · 거래처 · 어음번호 · 총금액(막힘) · 지급금액 · 적요].
     * 어음번호를 고르면 총금액 · 지급금액이 어음 금액으로 들어온다.
     */
    public record EndorseRequest(
            @NotNull(message = "어음번호: 자료를 입력 바랍니다.") @Size(max = 30, message = "어음번호는 30자까지 넣을 수 있습니다.") String noteNo,
            @NotNull(message = "거래처: 자료를 입력 바랍니다.") Long partnerId,
            LocalDate date,
            @NotNull(message = "지급금액: 자료를 입력 바랍니다.") @Positive(message = "지급금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String remark,
            Long departmentId,
            Long projectId
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
            @NotNull(message = "할인료를 입력하세요.") @PositiveOrZero(message = "할인료는 0 이상이어야 합니다.") BigDecimal discountFee
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
            String bankName, String remark, String createdBy,
            /** 원본 [내역만등록]으로 넣은 것(분개 없음) */
            boolean recordOnly,
            Long departmentId,
            Long projectId,
            /** [내역만등록] 감소 줄의 적요 · 부서 · 프로젝트 */
            String closeRemark,
            Long closeDepartmentId,
            Long closeProjectId,
            /** 받을어음감소(E010602)로 닫혔으면 그 한 장 전표 id — 있으면 감소를 지울 수 있다 */
            Long closeJournalEntryId,
            /** 받을어음거래처지급으로 어음을 받은 거래처 */
            Long closePartnerId,
            String closePartnerName
    ) {
        public static NoteResponse from(PromissoryNote n) {
            return new NoteResponse(
                    n.getId(), n.getNoteNo(),
                    n.getType(), n.getType().getDisplayName(),
                    n.getPartner().getId(), n.getPartner().getName(),
                    n.getIssueDate(), n.getDueDate(), n.getAmount(),
                    n.getStatus(), n.getStatus().getDisplayName(),
                    n.getClosedDate(), n.getDiscountFee(),
                    n.getBankName(), n.getRemark(), n.getCreatedBy(), n.isRecordOnly(),
                    n.getDepartmentId(), n.getProjectId(),
                    n.getCloseRemark(), n.getCloseDepartmentId(), n.getCloseProjectId(),
                    n.getCloseJournalEntry() == null ? null : n.getCloseJournalEntry().getId(),
                    n.getClosePartner() == null ? null : n.getClosePartner().getId(),
                    n.getClosePartner() == null ? null : n.getClosePartner().getName());
        }
    }

    /** 어음현황 요약: 보유 중인 어음의 잔액과 만기도래분 */
    public record NoteSummary(
            BigDecimal receivableHeld,
            BigDecimal payableHeld,
            BigDecimal receivableDueSoon,
            BigDecimal payableDueSoon,
            List<NoteResponse> notes,
            /*
             * 원본 [오천건이상조회] 와 같은 자리. 어음이 5천 장을 넘으면 목록만 자르고
             * <b>요약 넷은 기간 전체로</b> 낸다 — 자른 몫만 더하면 잔액이 조용히 줄어든다.
             */
            long totalRows,
            boolean truncated
    ) {}
}
