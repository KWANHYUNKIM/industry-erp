package com.erp.repository;

import com.erp.domain.CardUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CardUsageRepository extends JpaRepository<CardUsage, Long> {

    @Query("select u from CardUsage u " +
           "join fetch u.card join fetch u.expenseAccount left join fetch u.journalEntry " +
           "order by u.usageDate desc, u.id desc")
    List<CardUsage> findAllWithRefs();
}
