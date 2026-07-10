package com.erp.dto;

import com.erp.domain.CompanyInfo;
import jakarta.validation.constraints.NotBlank;

public final class CompanyInfoDtos {

    private CompanyInfoDtos() {}

    public record CompanyInfoRequest(
            @NotBlank(message = "회사명을 입력하세요.") String name,
            String ceo,
            String bizRegNo,
            String corpRegNo,
            String bizType,
            String bizItem,
            String tel,
            String fax,
            String email,
            String zipcode,
            String address,
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
