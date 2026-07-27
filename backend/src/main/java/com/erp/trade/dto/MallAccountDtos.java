package com.erp.trade.dto;

import com.erp.trade.domain.MallAccount;
import com.erp.trade.domain.enums.MallAccountType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class MallAccountDtos {

    private MallAccountDtos() {}

    public record CreateMallAccountRequest(
            String code,
            @NotBlank(message = "쇼핑몰명을 입력하세요.") String name,
            @NotNull(message = "구분을 선택하세요.") MallAccountType type,
            Long partnerId,
            String sellerId,
            String memo
    ) {}

    public record UpdateMallAccountRequest(
            @NotBlank(message = "쇼핑몰명을 입력하세요.") String name,
            @NotNull(message = "구분을 선택하세요.") MallAccountType type,
            Long partnerId,
            String sellerId,
            String memo,
            Boolean active
    ) {}

    public record MallAccountResponse(
            Long id, String code, String name,
            MallAccountType type, String typeName,
            Long partnerId, String partnerName,
            String sellerId, String memo, boolean active
    ) {
        public static MallAccountResponse from(MallAccount a) {
            return new MallAccountResponse(
                    a.getId(), a.getCode(), a.getName(),
                    a.getType(), a.getType().getDisplayName(),
                    a.getPartner() != null ? a.getPartner().getId() : null,
                    a.getPartner() != null ? a.getPartner().getName() : null,
                    a.getSellerId(), a.getMemo(), a.isActive());
        }
    }
}
