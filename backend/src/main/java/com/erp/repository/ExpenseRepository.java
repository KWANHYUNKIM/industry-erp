package com.erp.repository;

import com.erp.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    @Query("select e from Expense e join fetch e.account order by e.expenseDate desc, e.id desc")
    List<Expense> findAllWithAccount();
}
