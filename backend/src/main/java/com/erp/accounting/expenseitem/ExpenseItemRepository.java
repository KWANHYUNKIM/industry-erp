package com.erp.accounting.expenseitem;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExpenseItemRepository extends JpaRepository<ExpenseItem, Long> {

    @Query("select distinct i from ExpenseItem i left join fetch i.account left join fetch i.controlType " +
           "left join fetch i.employeeIds order by i.code")
    List<ExpenseItem> findAllWithRefs();

    boolean existsByCode(String code);
}
