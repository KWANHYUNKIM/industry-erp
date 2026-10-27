package com.erp.groupware.fieldwork.dto;

import com.erp.groupware.fieldwork.FieldVehicle;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class FieldVehicleDtos {

    private FieldVehicleDtos() {}

    /** 원본 '이동수단등록'. */
    public record SaveFieldVehicleRequest(
            @Size(max = 30, message = "이동수단코드는 30자까지 넣을 수 있습니다.")
            @NotBlank(message = "이동수단코드를 입력하세요.") String code,
            @Size(max = 100, message = "이동수단명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "이동수단명을 입력하세요.") String name,
            Boolean vehicle,
            @Size(max = 20, message = "차종은 20자까지 넣을 수 있습니다.")
            String carType,
            Boolean active
    ) {}

    public record FieldVehicleResponse(Long id, String code, String name, boolean vehicle, String carType, boolean active) {
        public static FieldVehicleResponse from(FieldVehicle v) {
            return new FieldVehicleResponse(v.getId(), v.getCode(), v.getName(), v.isVehicle(), v.getCarType(), v.isActive());
        }
    }
}
