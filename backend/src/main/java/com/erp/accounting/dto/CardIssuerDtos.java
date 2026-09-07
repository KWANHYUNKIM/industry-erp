package com.erp.accounting.dto;

import com.erp.accounting.domain.CardIssuer;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public final class CardIssuerDtos {

    private CardIssuerDtos() {}

    public record CreateCardIssuerRequest(
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "카드사명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "카드사명을 입력하세요.") String name,
            @PositiveOrZero(message = "수수료율은 0~100 입니다.")
            @DecimalMax(value = "100", message = "수수료율은 0~100 입니다.") BigDecimal feeRate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            /* 원본 E010109 폼의 나머지 칸들 — 담을 데가 없어 화면에 그리지 못하던 것이다. */
            Long accountId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String depositAccount,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String searchKeyword
    ) {}

    public record UpdateCardIssuerRequest(
            @Size(max = 100, message = "카드사명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "카드사명을 입력하세요.") String name,
            @PositiveOrZero(message = "수수료율은 0~100 입니다.")
            @DecimalMax(value = "100", message = "수수료율은 0~100 입니다.") BigDecimal feeRate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            /* 원본 E010109 폼의 나머지 칸들 — 담을 데가 없어 화면에 그리지 못하던 것이다. */
            Long accountId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String depositAccount,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String searchKeyword,
            Boolean active
    ) {}

    public record CardIssuerResponse(
            Long id, String code, String name, BigDecimal feeRate, String remark, boolean active,
            /** 계정은 id 와 <b>이름</b>을 같이 준다 — 화면이 목록을 다시 뒤지지 않게. */
            Long accountId, String accountName,
            String depositAccount, String searchKeyword
    ) {
        public static CardIssuerResponse from(CardIssuer c) {
            return new CardIssuerResponse(c.getId(), c.getCode(), c.getName(), c.getFeeRate(),
                    c.getRemark(), c.isActive(),
                    c.getAccount() != null ? c.getAccount().getId() : null,
                    c.getAccount() != null ? c.getAccount().getName() : null,
                    c.getDepositAccount(), c.getSearchKeyword());
        }
    }
}
