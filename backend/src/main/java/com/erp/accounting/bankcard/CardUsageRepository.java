package com.erp.accounting.bankcard;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CardUsageRepository extends JpaRepository<CardUsage, Long> {

    @Query("select u from CardUsage u " +
           "join fetch u.card join fetch u.expenseAccount left join fetch u.journalEntry " +
           "where u.usageDate >= :from and u.usageDate <= :to " +
           "order by u.usageDate desc, u.id desc")
    List<CardUsage> findAllWithRefs(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                             @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);

    /** 특정 카드의 사용내역 (대금결제 대상 후보) */
    @Query("select u from CardUsage u " +
           "join fetch u.card join fetch u.expenseAccount " +
           "where u.card.id = :cardId order by u.usageDate, u.id")
    List<CardUsage> findByCard(Long cardId);

    /** 카드 사용의 부가세(매입세액) 합 — 부가세 요약이 공제세액에 더한다. 분개도 차)부가세대급금(135) 으로 잡는다. */
    @Query("select coalesce(sum(u.vatAmount),0) from CardUsage u where u.usageDate between :from and :to")
    java.math.BigDecimal sumVat(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                                @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);
}
