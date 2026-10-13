package com.erp.accounting.contractitem;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** 원본 계약항목 [청구주기] — 1회 · 주기적. */
@Getter
@RequiredArgsConstructor
public enum BillingCycle {
    ONCE("1회"),
    PERIODIC("주기적");

    private final String displayName;
}
