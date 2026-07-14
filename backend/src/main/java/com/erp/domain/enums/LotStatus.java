package com.erp.domain.enums;

import java.math.BigDecimal;

/**
 * 로트/시리얼 상태. **저장하지 않고 파생한다.**
 *
 * 상태를 컬럼으로 들고 있으면 재고수량과 어긋난다 — 출고로 stockQty 가 0이 됐는데 상태는
 * '재고'로 남는 식이다. 그래서 보유수량과 보류 플래그에서 그때그때 계산한다.
 *
 * (예전에는 이 enum 이 선언만 되고 아무도 쓰지 않았고, 응답 DTO 가 "보류"/"출고완료"/"재고"
 *  문자열을 따로 지어내고 있었다. 규칙이 두 곳에 있으면 언젠가 갈라진다.)
 */
public enum LotStatus {
    IN_STOCK("재고"),
    SHIPPED("출고완료"),
    HOLD("보류");

    private final String displayName;

    LotStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 보류가 우선이다. 보류된 로트는 재고가 남아 있어도 쓸 수 없다. */
    public static LotStatus of(boolean held, BigDecimal stockQty) {
        if (held) return HOLD;
        return stockQty == null || stockQty.signum() <= 0 ? SHIPPED : IN_STOCK;
    }
}
