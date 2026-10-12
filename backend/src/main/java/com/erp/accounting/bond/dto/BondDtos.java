package com.erp.accounting.bond.dto;

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
            List<LineResponse> lines
    ) {
        public static BondEntryResponse from(BondEntry e) {
            return new BondEntryResponse(
                    e.getId(), e.getSide(), e.getEntryDate(), e.getEntryNo(),
                    e.getDirection(), e.getDirection().getDisplayName(),
                    e.getCreatedBy(), e.getUpdatedBy(),
                    e.getLines().stream().map(LineResponse::from).toList());
        }
    }
}
