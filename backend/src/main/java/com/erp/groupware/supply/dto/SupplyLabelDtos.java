package com.erp.groupware.supply.dto;

import com.erp.groupware.supply.SupplyLabel;
import jakarta.validation.constraints.Size;

public final class SupplyLabelDtos {

    private SupplyLabelDtos() {}

    /** 원본 '라벨등록' · '라벨수정' — 라벨코드(수정에선 안 씀) · 라벨명 · 색상('#ff0000'). */
    public record SaveSupplyLabelRequest(
            @Size(max = 20, message = "라벨코드는 20자까지 넣을 수 있습니다.") String code,
            @Size(max = 20, message = "라벨명은 20자까지 넣을 수 있습니다.") String name,
            @Size(max = 7, message = "색상을 다시 고르세요.") String color
    ) {}

    public record SupplyLabelResponse(Long id, String code, String name, String color, boolean active) {
        public static SupplyLabelResponse from(SupplyLabel l) {
            return new SupplyLabelResponse(l.getId(), l.getCode(), l.getName(), l.getColor(), l.isActive());
        }
    }
}
