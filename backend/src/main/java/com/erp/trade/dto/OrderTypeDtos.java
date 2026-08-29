package com.erp.trade.dto;

import com.erp.trade.domain.OrderType;
import com.erp.trade.domain.OrderTypeStep;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public final class OrderTypeDtos {

    private OrderTypeDtos() {}

    public record CreateOrderTypeRequest(
            @NotBlank(message = "유형코드를 입력하세요.") String code,
            @NotBlank(message = "유형명을 입력하세요.") String name,
            String description,
            /**
             * 이 유형이 밟아 갈 단계의 <b>순서</b>(단계 id 목록). 원본의 [1단계]~[10단계] 열이다.
             * 안 주면 단계 없는 유형 — 진행단계 화면에서 아무 데도 못 간다.
             */
            List<Long> stageIds,
            Boolean useInInput,
            /** 원본 [처리메뉴] — 이 유형을 고를 수 있는 입력 화면의 경로. 안 주면 어디서나. */
            String procMenu,
            String manager
    ) {}

    public record UpdateOrderTypeRequest(
            @NotBlank(message = "유형명을 입력하세요.") String name,
            String description,
            /** 순서대로 준다. 통째로 갈아 끼운다 — 부분 수정은 순서가 어긋나기 쉽다. */
            List<Long> stageIds,
            Boolean useInInput,
            /** 원본 [처리메뉴]. 안 주면 어디서나 쓴다는 뜻이다. */
            String procMenu,
            String manager,
            Boolean active
    ) {}

    /** 단계 한 칸. 원본의 [n단계] 칸에 들어가는 값이다. */
    public record OrderTypeStepResponse(int seq, Long stageId, String stageCode, String stageName) {
        public static OrderTypeStepResponse from(OrderTypeStep s) {
            return new OrderTypeStepResponse(
                    s.getSeq(), s.getStage().getId(), s.getStage().getCode(), s.getStage().getName());
        }
    }

    public record OrderTypeResponse(
            Long id,
            String code,
            String name,
            String description,
            List<OrderTypeStepResponse> steps,
            boolean useInInput,
            /** 원본 [처리메뉴]. 안 정했으면 null — 어느 화면에서나 쓴다. */
            String procMenu,
            String manager,
            boolean active
    ) {
        public static OrderTypeResponse from(OrderType t, List<OrderTypeStep> steps) {
            return new OrderTypeResponse(
                    t.getId(), t.getCode(), t.getName(), t.getDescription(),
                    steps.stream().map(OrderTypeStepResponse::from).toList(),
                    t.isUseInInput(), t.getProcMenu(), t.getManager(), t.isActive());
        }
    }
}
