package com.erp.inventory.dto;

import com.erp.inventory.domain.Warehouse;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class WarehouseDtos {

    private WarehouseDtos() {}

    public record CreateWarehouseRequest(
            @Size(max = 50, message = "창고코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "창고코드를 입력하세요.") String code,
            @Size(max = 100, message = "창고명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "창고명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String location,
            /** 구분 — 창고 · 공장 · 외주. 원본 창고등록리스트의 [구분] 열. 안 주면 창고. */
            String kind,
            /** 생산공정 id. 구분이 공장일 때. 이름은 화면이 공정 목록에서 붙인다. */
            Long processId,
            /** 외주거래처 id. 구분이 외주일 때 반드시 있어야 한다. */
            Long outsourcingPartnerId
    ) {}

    public record UpdateWarehouseRequest(
            @Size(max = 100, message = "창고명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "창고명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String location,
            /** 구분 — 창고 · 공장 · 외주. 원본 창고등록리스트의 [구분] 열. 안 주면 창고. */
            String kind,
            /** 생산공정 id. 구분이 공장일 때. 이름은 화면이 공정 목록에서 붙인다. */
            Long processId,
            /** 외주거래처 id. 구분이 외주일 때 반드시 있어야 한다. */
            Long outsourcingPartnerId,
            Boolean active
    ) {}

    public record WarehouseResponse(
            Long id,
            String code,
            String name,
            String location,
            String kind,
            Long processId,
            Long outsourcingPartnerId,
            boolean active
    ) {
        public static WarehouseResponse from(Warehouse w) {
            return new WarehouseResponse(w.getId(), w.getCode(), w.getName(), w.getLocation(),
                    w.getKind(), w.getProcessId(), w.getOutsourcingPartnerId(), w.isActive());
        }
    }
}
