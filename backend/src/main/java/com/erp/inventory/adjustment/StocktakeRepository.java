package com.erp.inventory.adjustment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface StocktakeRepository extends JpaRepository<Stocktake, Long> {

    /** 기간 안 간편 실사 — 품목 · 창고 · 조정을 한 번에(N+1 방지). 널은 서비스가 열린 끝으로 채운다. */
    @Query("select s from Stocktake s join fetch s.item join fetch s.warehouse left join fetch s.adjustment "
           + "where s.stocktakeDate between :from and :to order by s.stocktakeDate desc, s.id desc")
    List<Stocktake> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
