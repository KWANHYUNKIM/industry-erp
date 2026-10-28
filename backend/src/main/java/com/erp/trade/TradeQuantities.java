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

    /**
     * 손으로 고친 공급가액 · 부가세는 줄 수량과 부호가 같아야 한다 — 반품(음수 수량) 줄은 음수(원본 [반품처리] 공급가액
     * -60,000 · 부가세 -6,000), 일반 줄은 0 이상. 비운 값(null) · 0 은 본다.
     */
    public static void requireSameSign(BigDecimal qty, BigDecimal typed, String label) {
        if (typed == null || qty == null) return;
        if (typed.signum() * qty.signum() < 0) {
            throw ApiException.badRequest(label + "은(는) 수량과 부호가 같아야 합니다(반품 줄은 음수, 일반 줄은 0 이상).");
        }
    }
}
