package com.erp.accounting.dto;

import com.erp.accounting.domain.PaymentAgency;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class PaymentAgencyDtos {

    private PaymentAgencyDtos() {}

    public record CreatePaymentAgencyRequest(
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "결제대행사명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "결제대행사명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String ceoName,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String phone,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String email,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record UpdatePaymentAgencyRequest(
            @Size(max = 100, message = "결제대행사명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "결제대행사명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String ceoName,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String phone,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String email,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            Boolean active
    ) {}

    public record PaymentAgencyResponse(
            Long id, String code, String name, String ceoName, String phone, String email,
            String remark, boolean active
    ) {
        public static PaymentAgencyResponse from(PaymentAgency p) {
            return new PaymentAgencyResponse(
                    p.getId(), p.getCode(), p.getName(), p.getCeoName(), p.getPhone(),
                    p.getEmail(), p.getRemark(), p.isActive());
        }
    }
}
