package com.erp.dto;

import com.erp.domain.LocationStock;
import com.erp.domain.WarehouseLocation;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public class WmsDtos {

    public record CreateLocationRequest(
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @NotBlank(message = "로케이션 코드를 입력하세요.") String code,
            String zone,
            String rack,
            String level,
            String description
    ) {}

    public record UpdateLocationRequest(
            String zone,
            String rack,
            String level,
            String description,
            Boolean active
    ) {}

    /** 입고된 물량을 선반에 올린다 (미배치 → 로케이션) */
    public record PutawayRequest(
            @NotNull(message = "로케이션을 선택하세요.") Long locationId,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity
    ) {}

    /** 선반 사이 이동 (같은 창고 안) */
    public record MoveRequest(
            @NotNull(message = "출발 로케이션을 선택하세요.") Long fromLocationId,
            @NotNull(message = "도착 로케이션을 선택하세요.") Long toLocationId,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity
    ) {}

    /** 선반에서 내린다 (로케이션 → 미배치). 창고 재고는 그대로다. */
    public record PickRequest(
            @NotNull(message = "로케이션을 선택하세요.") Long locationId,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity
    ) {}

    public record LocationResponse(
            Long id,
            Long warehouseId,
            String warehouseName,
            String code,
            String zone,
            String rack,
            String level,
            String description,
            boolean active
    ) {
        public static LocationResponse from(WarehouseLocation l) {
            return new LocationResponse(
                    l.getId(), l.getWarehouse().getId(), l.getWarehouse().getName(),
                    l.getCode(), l.getZone(), l.getRack(), l.getLevel(),
                    l.getDescription(), l.isActive());
        }
    }

    public record LocationStockResponse(
            Long id,
            Long locationId,
            String locationCode,
            Long warehouseId,
            String warehouseName,
            Long itemId,
            String itemCode,
            String itemName,
            String unit,
            BigDecimal quantity
    ) {
        public static LocationStockResponse from(LocationStock s) {
            return new LocationStockResponse(
                    s.getId(),
                    s.getLocation().getId(), s.getLocation().getCode(),
                    s.getLocation().getWarehouse().getId(), s.getLocation().getWarehouse().getName(),
                    s.getItem().getId(), s.getItem().getCode(), s.getItem().getName(),
                    s.getItem().getUnit(),
                    s.getQuantity());
        }
    }

    /** (품목, 창고)별 배치 현황: 창고 재고 = 배치 + 미배치 */
    public record AllocationRow(
            Long itemId,
            String itemCode,
            String itemName,
            String unit,
            Long warehouseId,
            String warehouseName,
            BigDecimal stockQuantity,
            BigDecimal allocatedQuantity,
            BigDecimal unallocatedQuantity
    ) {}

    public record WmsOverview(
            List<LocationResponse> locations,
            List<LocationStockResponse> locationStocks,
            List<AllocationRow> allocations
    ) {}
}
