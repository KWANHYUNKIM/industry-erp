package com.erp.accounting.repository;

import com.erp.accounting.domain.ProcessExpense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProcessExpenseRepository extends JpaRepository<ProcessExpense, Long> {

    @Query("select e from ProcessExpense e join fetch e.process left join fetch e.warehouse "
            + "order by e.period desc, e.process.code asc")
    List<ProcessExpense> findAllWithRefs();

    @Query("select e from ProcessExpense e join fetch e.process left join fetch e.warehouse "
            + "where e.period = :period")
    List<ProcessExpense> findByPeriodWithRefs(String period);

    boolean existsByPeriodAndProcess_IdAndWarehouse_Id(String period, Long processId, Long warehouseId);

    boolean existsByPeriodAndProcess_IdAndWarehouseIsNull(String period, Long processId);
}
