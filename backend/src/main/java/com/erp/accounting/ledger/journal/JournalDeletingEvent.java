package com.erp.accounting.ledger.journal;

/**
 * 업무전표에서 만든 회계전표를 회계거래조회에서 지우기 직전에 낸다. 출처 업무전표가 같이 지워질 수 있게(원본: 회계거래조회에서
 * 고정자산증가 · 감소 전표를 지우면 고정자산전표조회에서도 사라진다). 듣는 쪽은 같은 트랜잭션 안에서 자기 전표를 지운다.
 */
public record JournalDeletingEvent(Long entryId, JournalSourceType sourceType, Long sourceId) {}
