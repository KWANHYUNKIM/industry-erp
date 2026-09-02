package com.erp.groupware.dto;

import com.erp.groupware.domain.PrintSignLine;
import com.erp.groupware.domain.PrintSignSlot;
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
            @Size(max = 100, message = "서식명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "서식명을 입력하세요.") String name,
            Boolean defaultLine,
            Boolean active,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
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
