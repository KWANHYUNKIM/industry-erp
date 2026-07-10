package com.erp.dto;

import com.erp.domain.BusinessPartner;
import com.erp.domain.PartnerType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class PartnerDtos {

    private PartnerDtos() {}

    public record CreatePartnerRequest(
            @NotBlank(message = "거래처코드를 입력하세요.") String code,
            @NotBlank(message = "상호를 입력하세요.") String name,
            @NotNull(message = "거래처 구분을 선택하세요.") PartnerType type,
            String bizRegNo,
            String ceoName,
            String bizType,
            String bizItem,
            String manager,
            String phone,
            String address
    ) {}

    public record UpdatePartnerRequest(
            @NotBlank(message = "상호를 입력하세요.") String name,
            @NotNull(message = "거래처 구분을 선택하세요.") PartnerType type,
            String bizRegNo,
            String ceoName,
            String bizType,
            String bizItem,
            String manager,
            String phone,
            String address,
            Boolean active
    ) {}

    public record UpdatePriceGroupRequest(
            String salesPriceGroup,
            String purchasePriceGroup
    ) {}

    public record PartnerResponse(
            Long id,
            String code,
            String name,
            PartnerType type,
            String typeName,
            String bizRegNo,
            String ceoName,
            String bizType,
            String bizItem,
            String manager,
            String phone,
            String address,
            String salesPriceGroup,
            String purchasePriceGroup,
            boolean active
    ) {
        public static PartnerResponse from(BusinessPartner p) {
            return new PartnerResponse(
                    p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                    p.getBizRegNo(), p.getCeoName(), p.getBizType(), p.getBizItem(),
                    p.getManager(), p.getPhone(), p.getAddress(),
                    p.getSalesPriceGroup(), p.getPurchasePriceGroup(), p.isActive());
        }
    }
}
