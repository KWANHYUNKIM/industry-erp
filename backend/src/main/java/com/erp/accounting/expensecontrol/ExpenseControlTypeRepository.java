package com.erp.accounting.expensecontrol;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExpenseControlTypeRepository extends JpaRepository<ExpenseControlType, Long> {
    List<ExpenseControlType> findAllByOrderByCodeAsc();
    boolean existsByCode(String code);
}
