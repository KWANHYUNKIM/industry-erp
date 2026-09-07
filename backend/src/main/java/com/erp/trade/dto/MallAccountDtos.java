package com.erp.trade.dto;

import com.erp.trade.domain.MallAccount;
import com.erp.trade.domain.enums.MallAccountType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class MallAccountDtos {

    private MallAccountDtos() {}

    public record CreateMallAccountRequest(
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "쇼핑몰명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "쇼핑몰명을 입력하세요.") String name,
            @NotNull(message = "구분을 선택하세요.") MallAccountType type,
            Long partnerId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String sellerId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String memo
    ) {}

    public record UpdateMallAccountRequest(
            @Size(max = 100, message = "쇼핑몰명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "쇼핑몰명을 입력하세요.") String name,
            @NotNull(message = "구분을 선택하세요.") MallAccountType type,
            Long partnerId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String sellerId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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
