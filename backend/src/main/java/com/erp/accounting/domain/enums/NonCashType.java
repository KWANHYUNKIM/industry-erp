package com.erp.accounting.domain.enums;

/**
 * 비현금거래(대체전표) 유형. 현금·예금이 한 푼도 움직이지 않는 거래만 여기서 처리한다.
 * 유형마다 차/대변 한쪽 또는 양쪽이 고정된다.
 */
public enum NonCashType {
    /** 같은 거래처의 채권·채무 상계. 차)외상매입금 / 대)외상매출금 */
    OFFSET("채권채무 상계"),
    /** 회수 불능 채권 정리. 차)대손상각비 / 대)외상매출금 */
    BAD_DEBT("대손처리"),
    /** 지출은 확정됐지만 아직 안 나간 돈. 차)비용계정 / 대)미지급금 */
    ACCRUAL("미지급 계상"),
    /** 계정 간 대체. 차/대변 모두 사용자가 고른다. */
    TRANSFER("계정대체");

    private final String displayName;

    NonCashType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
