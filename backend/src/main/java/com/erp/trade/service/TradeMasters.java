package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.trade.domain.BusinessPartner;

/**
 * 전표를 새로 쓸 때 거래처가 쓸 수 있는 상태인지 본다.
 *
 * <p>사용중지는 "더 이상 쓰지 말자"는 표시인데, 오래도록 표시만 되고 아무것도 막지 않아서
 * 중지한 거래처로 판매·구매·견적·수주·발주·출하·수출 전표가 그대로 저장됐다.
 *
 * <p>거래처는 {@code trade} 모듈의 엔티티라 품목·창고처럼 다른 모듈 서비스에 규칙을 맡길 수 없다.
 * 그렇다고 일곱 군데에 같은 문장을 흩어 놓으면 다음에 문구를 고칠 때 한두 곳이 빠진다.
 * 품목은 {@code ItemService.getUsable}, 창고는 {@code WarehouseService.getUsable} 이 같은 일을 한다.
 *
 * <p><b>이미 저장된 전표에는 쓰지 않는다.</b> 그때는 살아 있던 거래처가 나중에 중지됐다고 해서
 * 옛 전표를 못 읽거나 못 고치게 되면 안 된다. 새로 쓰는 자리에서만 부른다.
 */
final class TradeMasters {

    private TradeMasters() {}

    static BusinessPartner requireUsable(BusinessPartner partner) {
        if (!partner.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 거래처입니다: " + partner.getCode() + " " + partner.getName());
        }
        return partner;
    }
}
