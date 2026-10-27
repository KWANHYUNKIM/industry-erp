package com.erp.trade;

import com.erp.common.ApiException;
import com.erp.trade.partner.BusinessPartner;

/**
 * 전표를 새로 쓸 때 거래처를 얻는 자리.
 *
 * <p><b>사용중단 거래처도 받는다</b> — 원본 실측(2026-10-23, 두 번): 코드도움 [사용중단포함] 으로 고른
 * 사용중단 자료로도 전표가 저장된다. 품목 · 창고({@code ItemService.getUsable} ·
 * {@code WarehouseService.getUsable}) 도 같다. 부르는 자리가 많아 진입점은 그대로 둔다.
 */
public final class TradeMasters {

    private TradeMasters() {}

    public static BusinessPartner requireUsable(BusinessPartner partner) {
        // 원본 실측(2026-10-23): [사용중단포함] 으로 고른 사용중단 거래처도 전표가 저장된다 — 막지 않는다.
        return partner;
    }
}
