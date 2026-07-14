package com.erp.repository;

import com.erp.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    @Query("select e from Expense e join fetch e.account order by e.expenseDate desc, e.id desc")
    List<Expense> findAllWithAccount();

    /** 수입비용현황: 기간 내 지출 (계정 포함) */
    @Query("select e from Expense e join fetch e.account " +
            "where e.expenseDate between :from and :to " +
            "order by e.expenseDate desc, e.id desc")
    List<Expense> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
