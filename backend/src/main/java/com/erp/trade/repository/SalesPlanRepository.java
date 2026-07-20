package com.erp.trade.repository;

import com.erp.trade.domain.SalesPlan;
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
}
