package com.erp.trade.salesplan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SalesPlanRepository extends JpaRepository<SalesPlan, Long> {

    @Query("select p from SalesPlan p join fetch p.item " +
            "order by p.planYear desc, p.planMonth asc, p.item.name asc")
    List<SalesPlan> findAllWithItem();

    @Query("select p from SalesPlan p join fetch p.item " +
            "where p.planYear = :year " +
            "order by p.planMonth asc, p.item.name asc")
    List<SalesPlan> findByPlanYearWithItem(@Param("year") int year);

    /** 매출계획비교표 — 계획 일자(예상매출일자)가 기간 안인 계획. */
    @Query("select p from SalesPlan p join fetch p.item left join fetch p.partner left join fetch p.warehouse " +
            "left join fetch p.project left join fetch p.employee " +
            "where p.planDate between :from and :to")
    List<SalesPlan> findByPlanDateBetween(@Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to);
}
