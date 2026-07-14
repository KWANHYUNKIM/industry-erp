package com.erp.dto;

import com.erp.domain.PrintSignLine;
import com.erp.domain.PrintSignSlot;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class PrintSignDtos {

    private PrintSignDtos() {}

    public record SlotInput(
            @NotBlank(message = "칸 제목을 입력하세요.") String title,
            /** 비우면 빈 칸으로 인쇄된다 */
            String signerName
    ) {}

    public record SignLineRequest(
            @NotBlank(message = "서식명을 입력하세요.") String name,
            Boolean defaultLine,
            Boolean active,
            String remark,
            @NotEmpty(message = "결재 칸을 1개 이상 넣으세요.")
            @Size(max = 5, message = "결재 칸은 5개까지입니다.")
            @Valid List<SlotInput> slots
    ) {}

    public record SlotResponse(Long id, int slotOrder, String title, String signerName) {
        public static SlotResponse from(PrintSignSlot s) {
            return new SlotResponse(s.getId(), s.getSlotOrder(), s.getTitle(), s.getSignerName());
        }
    }

    public record SignLineResponse(
            Long id, String name, boolean defaultLine, boolean active, String remark,
            List<SlotResponse> slots
    ) {
        public static SignLineResponse from(PrintSignLine l) {
            return new SignLineResponse(
                    l.getId(), l.getName(), l.isDefaultLine(), l.isActive(), l.getRemark(),
                    l.getSlots().stream().map(SlotResponse::from).toList());
        }
    }
}
