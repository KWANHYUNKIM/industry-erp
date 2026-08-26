package com.erp.trade.dto;

import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.PartnerType;
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
            String address,
            /**
             * 그룹 (선택). 엔티티에는 관계가 있는데 <b>요청에만 빠져 있어</b> 아무도 그룹을
             * 지정할 수 없었다 — 그래서 채권/채무현황의 거래처그룹 소계가 늘 '(미지정)' 하나였고,
             * 특별단가의 '그룹별' 도 걸릴 일이 없었다.
             */
            Long partnerGroupId
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
            /** 그룹 (선택). 자세한 설명은 CreatePartnerRequest 쪽에 있다. */
            Long partnerGroupId,
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
            Long partnerGroupId,
            String partnerGroupName,
            boolean active
    ) {
        public static PartnerResponse from(BusinessPartner p) {
            return new PartnerResponse(
                    p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                    p.getBizRegNo(), p.getCeoName(), p.getBizType(), p.getBizItem(),
                    p.getManager(), p.getPhone(), p.getAddress(),
                    p.getSalesPriceGroup(), p.getPurchasePriceGroup(),
                    p.getPartnerGroup() != null ? p.getPartnerGroup().getId() : null,
                    p.getPartnerGroup() != null ? p.getPartnerGroup().getName() : null,
                    p.isActive());
        }
    }
}
