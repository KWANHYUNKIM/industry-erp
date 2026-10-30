package com.erp.trade.ordertype.dto;

import com.erp.trade.ordertype.OrderNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public final class OrderNumberDtos {

    private OrderNumberDtos() {}

    /* 원본 창은 빈 오더관리명 · 오더관리유형 칸만 붉게 하고 글은 없다 — 화면이 같은 칸을 붉게 한다. */
    /** orderNo 를 비우면 서버가 다음 다섯 자리 번호를 매긴다. */
    public record CreateOrderNumberRequest(
            @Size(max = 30, message = "오더관리번호는 30자까지 넣을 수 있습니다.") String orderNo,
            @Size(max = 100, message = "오더관리명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "오더관리명을 입력하세요.") String name,
            @NotNull(message = "오더관리유형을 고르세요.") Long orderTypeId,
            LocalDate createdDate,
            @Size(max = 200, message = "적요1은 200자까지 넣을 수 있습니다.") String remarks1,
            @Size(max = 200, message = "적요2는 200자까지 넣을 수 있습니다.") String remarks2,
            @Size(max = 100, message = "검색창내용은 100자까지 넣을 수 있습니다.") String searchKeyword
    ) {}

    /** 번호 · 유형은 원본처럼 등록한 뒤 잠긴다(2026-10-30 실측 — 수정 창의 번호는 글자로만 보인다) — 수정 요청에 없다. */
    public record UpdateOrderNumberRequest(
            @Size(max = 100, message = "오더관리명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "오더관리명을 입력하세요.") String name,
            LocalDate createdDate,
            @Size(max = 200, message = "적요1은 200자까지 넣을 수 있습니다.") String remarks1,
            @Size(max = 200, message = "적요2는 200자까지 넣을 수 있습니다.") String remarks2,
            @Size(max = 100, message = "검색창내용은 100자까지 넣을 수 있습니다.") String searchKeyword,
            Boolean active
    ) {}

    public record CompleteOrderNumbersRequest(@NotNull List<Long> ids) {}

    public record OrderNumberResponse(
            Long id, String orderNo, String name,
            Long orderTypeId, String orderTypeCode, String orderTypeName,
            LocalDate createdDate, String remarks1, String remarks2, String searchKeyword,
            boolean completed, boolean active
    ) {
        public static OrderNumberResponse from(OrderNumber o) {
            return new OrderNumberResponse(o.getId(), o.getOrderNo(), o.getName(),
                    o.getOrderType().getId(), o.getOrderType().getCode(), o.getOrderType().getName(),
                    o.getCreatedDate(), o.getRemarks1(), o.getRemarks2(), o.getSearchKeyword(),
                    o.isCompleted(), o.isActive());
        }
    }
}
