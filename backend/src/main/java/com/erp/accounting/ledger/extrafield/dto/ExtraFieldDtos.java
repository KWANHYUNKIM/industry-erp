package com.erp.accounting.ledger.extrafield.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class ExtraFieldDtos {

    private ExtraFieldDtos() {}

    public record TypeResponse(Long id, String code, String name, boolean active, java.time.LocalDateTime updatedAt) {}

    public record SaveTypeRequest(
            @Size(max = 20, message = "추가항목유형코드는 20자까지 넣을 수 있습니다.") @NotBlank(message = "추가항목유형코드를 입력하세요.") String code,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") @NotBlank(message = "추가항목유형명을 입력하세요.") String name
    ) {}

    /** 추가항목설정 창 한 줄 — 항목 1~8 */
    public record SlotRow(int no, String name, String kind, boolean enabled, boolean required, String defaultValue) {}

    public record SlotSave(int no, boolean enabled, boolean required, @Size(max = 100) String defaultValue) {}

    public record AccountRow(Long id, Long accountId, String accountCode, String accountName) {}

    public record AddAccountsRequest(List<Long> accountIds) {}

    /** 회사 공용 항목 한 칸 — [추가항목등록] 창 */
    public record CompanySlot(int no, String name, String kind, String setting) {}
}
