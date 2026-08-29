package com.erp.settings.dto;

import com.erp.settings.domain.CompanyInfo;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class CompanyInfoDtos {

    private CompanyInfoDtos() {}

    public record CompanyInfoRequest(
            @Size(max = 200, message = "회사명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "회사명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String ceo,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String bizRegNo,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String corpRegNo,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bizType,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bizItem,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String tel,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String fax,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String email,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String zipcode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String addressDetail
    ) {}

    public record CompanyInfoResponse(
            Long id, String name, String ceo, String bizRegNo, String corpRegNo,
            String bizType, String bizItem, String tel, String fax, String email,
            String zipcode, String address, String addressDetail
    ) {
        public static CompanyInfoResponse from(CompanyInfo c) {
            if (c == null) return null;
            return new CompanyInfoResponse(
                    c.getId(), c.getName(), c.getCeo(), c.getBizRegNo(), c.getCorpRegNo(),
                    c.getBizType(), c.getBizItem(), c.getTel(), c.getFax(), c.getEmail(),
                    c.getZipcode(), c.getAddress(), c.getAddressDetail());
        }
    }
}
