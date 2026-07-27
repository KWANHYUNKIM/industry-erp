package com.erp.accounting.dto;

import com.erp.accounting.domain.PaymentAgency;
import jakarta.validation.constraints.NotBlank;

public final class PaymentAgencyDtos {

    private PaymentAgencyDtos() {}

    public record CreatePaymentAgencyRequest(
            String code,
            @NotBlank(message = "결제대행사명을 입력하세요.") String name,
            String ceoName,
            String phone,
            String email,
            String remark
    ) {}

    public record UpdatePaymentAgencyRequest(
            @NotBlank(message = "결제대행사명을 입력하세요.") String name,
            String ceoName,
            String phone,
            String email,
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
