package com.erp.accounting.paymentagency.dto;

import com.erp.accounting.paymentagency.PaymentAgency;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.DecimalMax;

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
            String remark,
            /* 원본 E010114 폼의 나머지 칸들 — 담을 데가 없어 화면에 그리지 못하던 것이다. */
            Long accountId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String depositAccount,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String searchKeyword,
            @PositiveOrZero(message = "수수료율은 0~100 입니다.")
            @DecimalMax(value = "100", message = "수수료율은 0~100 입니다.") java.math.BigDecimal feeRate,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String regNoKind,
            Boolean foreignCurrency,
            /** 외화거래처로 고른 통화(외화등록). 없으면 내자. */
            Long currencyId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String bizType,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String bizItem,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String manager,
            Boolean taxReport,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String postalCode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String address,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String postalCode2,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String address2
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
            /* 원본 E010114 폼의 나머지 칸들 — 담을 데가 없어 화면에 그리지 못하던 것이다. */
            Long accountId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String depositAccount,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String searchKeyword,
            @PositiveOrZero(message = "수수료율은 0~100 입니다.")
            @DecimalMax(value = "100", message = "수수료율은 0~100 입니다.") java.math.BigDecimal feeRate,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String regNoKind,
            Boolean foreignCurrency,
            /** 외화거래처로 고른 통화(외화등록). 없으면 내자. */
            Long currencyId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String bizType,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String bizItem,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String manager,
            Boolean taxReport,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String postalCode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String address,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String postalCode2,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String address2,
            Boolean active
    ) {}

    public record PaymentAgencyResponse(
            Long id, String code, String name, String ceoName, String phone, String email,
            String remark, boolean active,
            /** 계정은 id 와 <b>이름</b>을 같이 준다 — 화면이 목록을 다시 뒤지지 않게. */
            Long accountId, String accountName,
            String depositAccount, String searchKeyword,
            java.math.BigDecimal feeRate, String regNoKind, boolean foreignCurrency,
            Long currencyId, String currencyName,
            String bizType, String bizItem, String manager, boolean taxReport,
            String postalCode, String address, String postalCode2, String address2
    ) {
        public static PaymentAgencyResponse from(PaymentAgency p) {
            return new PaymentAgencyResponse(
                    p.getId(), p.getCode(), p.getName(), p.getCeoName(), p.getPhone(),
                    p.getEmail(), p.getRemark(), p.isActive(),
                    p.getAccount() != null ? p.getAccount().getId() : null,
                    p.getAccount() != null ? p.getAccount().getName() : null,
                    p.getDepositAccount(), p.getSearchKeyword(),
                    p.getFeeRate(), p.getRegNoKind(), p.isForeignCurrency(),
                    p.getCurrency() != null ? p.getCurrency().getId() : null,
                    p.getCurrency() != null ? p.getCurrency().getName() : null,
                    p.getBizType(), p.getBizItem(), p.getManager(), p.isTaxReport(),
                    p.getPostalCode(), p.getAddress(), p.getPostalCode2(), p.getAddress2());
        }
    }

    /** [이체정보] 이체정보등록 · 이체정보수정 창. 원본 필수는 계좌번호 하나(빈 채 저장하면 그 칸만 빨간 테두리). */
    public record SaveTransferRequest(
            @Size(max = 10) String bankCode,
            @Size(max = 50) String bankName,
            @NotBlank(message = "계좌번호를 입력 바랍니다.") @Size(max = 50) String accountNo,
            @Size(max = 50) String holder,
            @Size(max = 100) String memo1,
            @Size(max = 100) String memo2,
            boolean isDefault
    ) {}

    public record TransferResponse(
            Long id, Long paymentAgencyId, String bankCode, String bankName, String accountNo,
            String holder, String memo1, String memo2, boolean isDefault
    ) {
        public static TransferResponse from(com.erp.accounting.paymentagency.PaymentAgencyTransfer t) {
            return new TransferResponse(t.getId(), t.getPaymentAgency().getId(), t.getBankCode(), t.getBankName(),
                    t.getAccountNo(), t.getHolder(), t.getMemo1(), t.getMemo2(), t.isDefaultTransfer());
        }
    }
}

