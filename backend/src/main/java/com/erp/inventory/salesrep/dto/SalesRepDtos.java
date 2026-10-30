package com.erp.inventory.salesrep.dto;

import com.erp.inventory.salesrep.SalesRep;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class SalesRepDtos {

    private SalesRepDtos() {}

    public record SalesRepResponse(
            Long id, String code, String name, String searchKeyword, String remark,
            String phone, String email,
            String extra3, String extra4, String extra5, String extra6,
            boolean active
    ) {
        public static SalesRepResponse from(SalesRep r) {
            return new SalesRepResponse(r.getId(), r.getCode(), r.getName(), r.getSearchKeyword(), r.getRemark(),
                    r.getPhone(), r.getEmail(), r.getExtra3(), r.getExtra4(), r.getExtra5(), r.getExtra6(),
                    r.isActive());
        }
    }

    /** 등록 · 수정이 같은 칸을 쓴다(원본 사원(담당)등록 · 사원(담당)수정 창). 코드는 수정 때 바꾸지 않는다. */
    public record SalesRepRequest(
            @Size(max = 50) String code,
            @NotBlank(message = "사원(담당)명을 입력하세요.") @Size(max = 100) String name,
            @Size(max = 100) String searchKeyword,
            @Size(max = 200) String remark,
            @Size(max = 30) String phone,
            @Size(max = 100) String email,
            @Size(max = 100) String extra3,
            @Size(max = 100) String extra4,
            @Size(max = 100) String extra5,
            @Size(max = 100) String extra6
    ) {}

    public record ActiveRequest(boolean active) {}

    public record NextCodeResponse(String code) {}
}
