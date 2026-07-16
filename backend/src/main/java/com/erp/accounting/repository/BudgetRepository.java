package com.erp.accounting.repository;

import com.erp.accounting.domain.Budget;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BudgetRepository extends JpaRepository<Budget, Long> {

    @Query("select b from Budget b join fetch b.account " +
            "where b.period = :period order by b.account.code")
    List<Budget> findByPeriodWithAccount(@Param("period") String period);

    Optional<Budget> findByPeriodAndAccount_Id(String period, Long accountId);
}
