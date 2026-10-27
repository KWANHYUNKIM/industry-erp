package com.erp.accounting.expensegroup;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExpenseGroupRepository extends JpaRepository<ExpenseGroup, Long> {

    @Query("select distinct g from ExpenseGroup g left join fetch g.controlType left join fetch g.items order by g.code")
    List<ExpenseGroup> findAllWithRefs();

    boolean existsByCode(String code);

    @Query("select g.code from ExpenseGroup g")
    List<String> findAllCodes();
}
