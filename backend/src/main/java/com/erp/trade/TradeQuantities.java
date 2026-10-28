package com.erp.trade;

import com.erp.common.ApiException;

import java.math.BigDecimal;
import java.util.List;

/** 판매 · 구매 줄 수량 규칙 — 두 기능이 같이 쓴다. */
public final class TradeQuantities {

    private TradeQuantities() {
    }

    /**
     * 0 은 받지 않는다(원본 [수량] 칸 '유효키항목 필수입력'). 음수는 반품 줄이라 받는다 — 원본 판매 [반품처리] 가
     * 수량 -30 인 판매입력을 연다(2026-10-28 loginaa 실측). 원본에는 거래구분 칸이 없다.
     */
    public static void require(List<BigDecimal> qtys) {
        for (BigDecimal q : qtys) {
            if (q.signum() == 0) throw ApiException.badRequest("수량을 입력하세요.");
        }
    }
}
