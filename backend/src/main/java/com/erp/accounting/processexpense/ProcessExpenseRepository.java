package com.erp.accounting.processexpense;

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

    /** 원가 기간 삭제 — 그 기간 달들의 노무비/경비 줄을 함께 지운다(기준년월이 yyyy-MM 이라 문자열 범위가 달 범위다). */
    @org.springframework.data.jpa.repository.Modifying
    @Query("delete from ProcessExpense e where e.period >= :from and e.period <= :to")
    int deleteByPeriodRange(String from, String to);

    boolean existsByPeriodAndProcess_IdAndWarehouse_Id(String period, Long processId, Long warehouseId);

    boolean existsByPeriodAndProcess_IdAndWarehouseIsNull(String period, Long processId);
}
