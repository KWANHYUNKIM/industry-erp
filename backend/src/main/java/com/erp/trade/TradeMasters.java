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

    /** 원본 기본 거래처 [임의거래처] 의 코드 — 고르면 거래처 이름 칸이 열린다(원본 실측 2026-10-28). */
    public static final String ANY_PARTNER_CODE = "12341234";

    public static boolean isAnyPartner(BusinessPartner partner) {
        return partner != null && ANY_PARTNER_CODE.equals(partner.getCode());
    }

    /**
     * 전표에 남길 거래처명. 임의거래처면 화면이 보낸 이름(비면 마스터 이름), 그 밖에는 마스터 이름.
     * 원본: 임의거래처를 고르면 이름 칸을 고칠 수 있고 저장한 이름이 목록 거래처명이 된다(견적 11/21-2 '경동상회').
     */
    public static String partnerNameSnapshot(BusinessPartner partner, String requested) {
        if (partner == null) return null;
        if (isAnyPartner(partner) && requested != null && !requested.isBlank()) {
            String n = requested.trim();
            return n.length() > 200 ? n.substring(0, 200) : n;
        }
        return partner.getName();
    }
}
