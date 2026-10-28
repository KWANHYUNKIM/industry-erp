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
     * 수량 -30 인 판매입력을 연다(2026-10-28 loginaa 실측). 다만 거래구분 '반품'(양수로 적고 서버가 뒤집는 옛 길)에
     * 음수를 섞으면 뒤집혀 판매가 되므로 막는다.
     */
    public static void require(List<BigDecimal> qtys, boolean flip) {
        for (BigDecimal q : qtys) {
            if (q.signum() == 0) throw ApiException.badRequest("수량을 입력하세요.");
            if (flip && q.signum() < 0) {
                throw ApiException.badRequest("거래구분이 반품이면 수량을 양수로 적습니다. 음수 수량은 거래구분 일반으로 저장하세요.");
            }
        }
    }
}
