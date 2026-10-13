package com.erp.trade.orderrelease.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class OrderReleaseDtos {
    private OrderReleaseDtos() {}

    /** 미처리 탭 한 줄 — 주문 줄과 아직 출고처리 안 한 잔량. */
    public record PendingLine(
            Long orderId, String orderNo, LocalDate orderDate, Long orderLineId,
            Long partnerId, String partnerName, Long warehouseId, Long projectId,
            Long itemId, String itemCode, String itemName, String spec,
            BigDecimal orderQty, BigDecimal releasedQty, BigDecimal remainQty,
            LocalDate dueDate, String remark, java.time.LocalDateTime orderUpdatedAt) {}

    /** 처리 탭 한 줄. */
    public record ReleaseRow(
            Long id, String releaseNo, LocalDate releaseDate,
            Long orderId, String orderNo, LocalDate orderDate,
            String partnerName, String itemSummary, BigDecimal totalQty,
            Long saleId, String saleNo, LocalDate saleDate) {}

    /** 판매입력으로 넘길 때 — 거래처 · 창고 · 프로젝트 · 담당자와 줄(품목 · 수량 · 주문 단가). */
    public record ReleaseDetail(
            Long id, String releaseNo, LocalDate releaseDate,
            Long orderId, String orderNo, LocalDate orderDate,
            Long partnerId, Long warehouseId, Long projectId, Long employeeId, boolean taxable,
            Long saleId, List<DetailLine> lines) {}

    public record DetailLine(Long itemId, BigDecimal quantity, BigDecimal unitPrice) {}

    /** '출고등록' 창 [저장(F8)] — 일자와 고른 주문 줄의 출고수량. 처리구분은 '처리' 하나뿐이라 받지 않는다. */
    public record CreateReleaseRequest(
            @NotNull(message = "일자를 입력하세요.") LocalDate releaseDate,
            @NotEmpty(message = "리스트에 선택된 자료가 없습니다.") @Valid List<ReleaseLineRequest> lines) {}

    public record ReleaseLineRequest(
            @NotNull Long orderLineId,
            @NotNull(message = "출고수량을 입력하세요.") @Positive(message = "출고수량은 0보다 커야 합니다.") BigDecimal quantity) {}

    /** 처리 탭 [판매] '입력' 으로 만든 판매를 건다. */
    public record LinkSaleRequest(@NotNull Long saleId) {}
}
