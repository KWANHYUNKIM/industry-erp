package com.erp.accounting.fund.fundplan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface FundPlanRepository extends JpaRepository<FundPlan, Long> {

    @Query("select p from FundPlan p left join fetch p.project left join fetch p.bankAccount b left join fetch b.glAccount " +
           "left join fetch p.counterAccount left join fetch p.partner " +
           "where p.planDate >= :from and p.planDate <= :to order by p.planDate desc, p.id desc")
    List<FundPlan> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
