package com.erp.groupware.printsign.dto;

import com.erp.groupware.printsign.PrintSignLine;
import com.erp.groupware.printsign.PrintSignSlot;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class PrintSignDtos {

    private PrintSignDtos() {}

    public record SlotInput(
            @Size(max = 30, message = "명칭은 30자까지 넣을 수 있습니다.") String title,
            @Min(value = 1, message = "가로크기는 1 이상이어야 합니다.")
            @Max(value = 999, message = "가로크기는 999 까지 넣을 수 있습니다.") Integer widthPx,
            @Min(value = 8, message = "글자크기를 고르세요.") @Max(value = 20, message = "글자크기를 고르세요.") Integer fontPx
    ) {}

    public record LineInput(
            @NotNull @Min(1) @Max(2) Integer lineNo,
            @Size(max = 30, message = "명칭은 30자까지 넣을 수 있습니다.") String labelName,
            @Min(value = 1, message = "가로크기는 1 이상이어야 합니다.")
            @Max(value = 999, message = "가로크기는 999 까지 넣을 수 있습니다.") Integer labelWidth,
            @Min(value = 8, message = "글자크기를 고르세요.") @Max(value = 20, message = "글자크기를 고르세요.") Integer labelFont,
            @Size(max = 9, message = "결재자는 9칸까지입니다.") @Valid List<SlotInput> slots
    ) {}

    /** 한 모듈의 결재라인 1 · 2 를 한 번에 저장한다(원본 [저장(F8)]) */
    public record SaveRequest(
            @NotEmpty @Size(max = 2) @Valid List<LineInput> lines
    ) {}

    public record SlotResponse(int slotOrder, String title, Integer widthPx, Integer fontPx) {
        public static SlotResponse from(PrintSignSlot s) {
            return new SlotResponse(s.getSlotOrder(), s.getTitle(), s.getWidthPx(), s.getFontPx());
        }
    }

    public record LineResponse(
            int lineNo, String labelName, Integer labelWidth, Integer labelFont, List<SlotResponse> slots
    ) {
        public static LineResponse from(PrintSignLine l) {
            return new LineResponse(l.getLineNo(), l.getLabelName(), l.getLabelWidth(), l.getLabelFont(),
                    l.getSlots().stream().map(SlotResponse::from).toList());
        }
    }

    public record ModuleResponse(String module, List<LineResponse> lines) {}
}
