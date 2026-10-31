package com.erp.accounting.fund.budget;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface BudgetPlanRepository extends JpaRepository<BudgetPlan, Long> {

    @Query("select b from BudgetPlan b join fetch b.account " +
            "where b.fiscalYear between :fromYear and :toYear order by b.account.code, b.id")
    List<BudgetPlan> findInYearsWithAccount(@Param("fromYear") int fromYear, @Param("toYear") int toYear);

    @Query("select b from BudgetPlan b join fetch b.account " +
            "where b.fiscalYear = :year and b.account.id = :accountId order by b.id")
    List<BudgetPlan> findByYearAndAccount(@Param("year") int year, @Param("accountId") Long accountId);

    @Query("select b from BudgetPlan b where b.fiscalYear = :year and b.account.id in :accountIds")
    List<BudgetPlan> findByYearAndAccounts(@Param("year") int year, @Param("accountIds") Collection<Long> accountIds);
}
