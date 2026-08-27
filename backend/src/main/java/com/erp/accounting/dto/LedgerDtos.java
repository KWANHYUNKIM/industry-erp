package com.erp.accounting.dto;

import com.erp.trade.domain.PartnerType;

import java.math.BigDecimal;

public final class LedgerDtos {

    private LedgerDtos() {}

    /**
     * 거래처별채권·거래처별채무의 <b>기간 움직임</b>.
     *
     * <p>원본 열 실측(사본):
     * 채권 — 거래처명 · 기초채권 · 재고매출 · 회계매출 · 수금합계 · 기타할인등차액 · 잔액,
     * 채무 — 거래처명 · 기초채무 · 재고매입 · 회계매입 · 지급합계 · 기타할인등차액 · 잔액.
     *
     * <p>잔액만 보면 왜 움직였는지 알 수 없다 — 새로 판 것 때문인지, 수금이 안 들어온
     * 것인지 구분이 안 된다. 그래서 원본은 잔액을 이렇게 쪼개 놓는다.
     *
     * <p>항등식: 기초 + 재고 + 회계 − 수금(지급) + 기타차액 = 잔액.
     * 기타차액은 <b>나머지</b>다 — 우리가 이름 붙여 세지 못한 움직임이 있으면 여기 남는다.
     * 0 이 아니면 어딘가 빠뜨린 것이 있다는 뜻이라 숨기지 않는다.
     */
    public record PartnerMovementResponse(
            Long partnerId, String code, String name, String manager,
            /** 기간 시작 전날까지의 잔액 */
            BigDecimal opening,
            /** 재고매출(판매전표) / 재고매입(구매전표) */
            BigDecimal stockAmount,
            /** 회계매출 / 회계매입 — 회계전표가 통제계정을 직접 움직인 것 */
            BigDecimal accountingAmount,
            /** 수금합계 / 지급합계 — 정산전표 + 회계전표의 통제계정 반대편 */
            BigDecimal settledAmount,
            /** 기타할인등차액 — 위 넷으로 설명되지 않는 나머지 */
            BigDecimal otherDiff,
            /** 기간 종료일 잔액 */
            BigDecimal closing
    ) {}

    /** 거래처별 채권(매출합계)·채무(매입합계) 현황 */
    public record PartnerBalanceResponse(
            Long partnerId,
            String code,
            String name,
            PartnerType type,
            String typeName,
            BigDecimal receivable,   // 채권 (외상매출금) = 매출 합계 − 수금
            BigDecimal payable,      // 채무 (외상매입금) = 매입 합계 − 지급
            // ── 채권/채무현황(E040703·E040721) 조건용. 기존 화면은 무시해도 되는 추가 필드.
            Long partnerGroupId,
            String partnerGroupName,
            String manager,          // 거래처관리담당자
            boolean active           // false 면 사용중단 거래처
    ) {}
}
