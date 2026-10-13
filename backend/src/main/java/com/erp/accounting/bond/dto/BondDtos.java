package com.erp.accounting.bond.dto;

import com.erp.accounting.fastvoucher.FastVoucher;
import com.erp.accounting.journal.JournalEntry;

import com.erp.accounting.bond.BondDirection;
import com.erp.accounting.bond.BondEntry;
import com.erp.accounting.bond.BondLine;
import com.erp.accounting.bond.BondSide;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class BondDtos {

    private BondDtos() {}

    /** 창의 한 줄. 증가 줄은 만기일자를 받고, 감소 줄은 받지 않는다(원본 감소 창에 칸이 없다). */
    public record LineRequest(
            @NotNull(message = "계정을 입력하세요.") Long accountId,
            Long partnerId,
            @Size(max = 30, message = "채권번호는 30자까지 넣을 수 있습니다.") String bondNo,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            LocalDate dueDate,
            Long departmentId,
            Long projectId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String memo
    ) {}

    public record CreateBondRequest(
            @NotNull(message = "채권 · 채무 구분이 없습니다.") BondSide side,
            @NotNull(message = "전표일자를 입력하세요.") LocalDate entryDate,
            @NotNull(message = "증감구분을 선택하세요.") BondDirection direction,
            @NotEmpty(message = "저장할 내용이 없습니다.") List<@Valid LineRequest> lines
    ) {}

    /** 수정 창 — 전표일자 · 증감구분은 막혀 있고(원본 수정 창이 글자로만 보여 준다) 줄만 바꾼다. */
    public record UpdateBondRequest(
            @NotEmpty(message = "저장할 내용이 없습니다.") List<@Valid LineRequest> lines
    ) {}

    public record DeleteBondsRequest(@NotEmpty(message = "삭제할 전표를 선택하세요.") List<Long> ids) {}

    public record LineResponse(
            Long id, Integer lineNo,
            Long accountId, String accountCode, String accountName,
            Long partnerId, String partnerCode, String partnerName,
            String bondNo, BigDecimal amount, LocalDate dueDate,
            Long departmentId, Long projectId, String projectName, String memo
    ) {
        public static LineResponse from(BondLine l) {
            return new LineResponse(
                    l.getId(), l.getLineNo(),
                    l.getAccount().getId(), l.getAccount().getCode(), l.getAccount().getName(),
                    l.getPartner() != null ? l.getPartner().getId() : null,
                    l.getPartner() != null ? l.getPartner().getCode() : null,
                    l.getPartner() != null ? l.getPartner().getName() : null,
                    l.getBondNo(), l.getAmount(), l.getDueDate(),
                    l.getDepartmentId(),
                    l.getProject() != null ? l.getProject().getId() : null,
                    l.getProject() != null ? l.getProject().getName() : null,
                    l.getMemo());
        }
    }

    public record BondEntryResponse(
            Long id, BondSide side, LocalDate entryDate, Integer entryNo,
            BondDirection direction, String directionName,
            String createdBy, String updatedBy,
            List<LineResponse> lines,
            /** 원본 [출처업무] — '채권내역'(직접 입력) · '입금보고서'(채권감소등록 [입금보고서작성]). */
            String sourceName,
            /** 연결된 입금보고서 · 그 회계전표 — 원본 [회계일자-No.] 칸. 직접 넣은 장은 모두 비어 있다. */
            Long sourceVoucherId, Long journalEntryId, LocalDate journalDate, String journalDocNo
    ) {
        public static BondEntryResponse from(BondEntry e) {
            FastVoucher v = e.getSourceVoucher();
            JournalEntry j = v != null ? v.getJournalEntry() : null;
            return new BondEntryResponse(
                    e.getId(), e.getSide(), e.getEntryDate(), e.getEntryNo(),
                    e.getDirection(), e.getDirection().getDisplayName(),
                    e.getCreatedBy(), e.getUpdatedBy(),
                    e.getLines().stream().map(LineResponse::from).toList(),
                    v != null ? v.getType().getDisplayName() : (e.getSide() == BondSide.RECEIVABLE ? "채권내역" : "채무내역"),
                    v != null ? v.getId() : null,
                    j != null ? j.getId() : null,
                    j != null ? j.getEntryDate() : null,
                    j != null ? j.getDocNo() : null);
        }
    }

    /**
     * 채권감소등록 [입금보고서작성] 창 — 원본(2026-10-13 loginaa 실측) 수금형태 · 입금계좌 · 적요 · 전표 묶음기준을 고르고
     * [적용] 하면 입금보고서가 채워진 채 열리고, 거기서 [저장] 하면 회계전표(차 입금계좌 / 대 채권계정)와 채권 감소가 함께 생긴다.
     * 우리는 그 입금보고서 창의 줄을 그대로 받는다(줄마다 채권번호를 들고 온다).
     */
    public record DepositReportRequest(
            @NotNull(message = "일자를 입력하세요.") LocalDate date,
            /** 입금계좌 — 비우고 cash 가 참이면 000 현금. */
            Long bankAccountId,
            Boolean cash,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String description,
            @NotEmpty(message = "저장할 내용이 없습니다.") List<@Valid DepositLine> lines
    ) {}

    public record DepositLine(
            @NotNull(message = "계정을 입력하세요.") Long accountId,
            Long partnerId,
            @NotNull(message = "채권번호 : 유효키항목 필수입력") @Size(max = 30) String bondNo,
            @NotNull(message = "금액을 입력 바랍니다.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            Long departmentId,
            Long projectId,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String memo,
            /** 수금(지급)형태 '수표' — 수표번호입력 창의 번호. 있으면 그 줄 금액만큼 수령(발행)수표가 하나 는다(2026-10-14 실측). */
            @Size(max = 30, message = "수표번호는 30자까지 넣을 수 있습니다.") String checkNo
    ) {}
}
