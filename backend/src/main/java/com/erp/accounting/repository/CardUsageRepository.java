package com.erp.accounting.repository;

import com.erp.accounting.domain.CardUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CardUsageRepository extends JpaRepository<CardUsage, Long> {

    @Query("select u from CardUsage u " +
           "join fetch u.card join fetch u.expenseAccount left join fetch u.journalEntry " +
           "order by u.usageDate desc, u.id desc")
    List<CardUsage> findAllWithRefs();

    /** 특정 카드의 사용내역 (대금결제 대상 후보) */
    @Query("select u from CardUsage u " +
           "join fetch u.card join fetch u.expenseAccount " +
           "where u.card.id = :cardId order by u.usageDate, u.id")
    List<CardUsage> findByCard(Long cardId);
}
