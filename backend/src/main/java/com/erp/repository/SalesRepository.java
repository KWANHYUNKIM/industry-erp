package com.erp.repository;

import com.erp.domain.Sales;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface SalesRepository extends JpaRepository<Sales, Long> {

    @Query("select s from Sales s join fetch s.partner join fetch s.warehouse " +
            "order by s.saleDate desc, s.id desc")
    List<Sales> findAllWithRefs();

    /** 기간 내 판매 전표 (이익현황 집계용) */
    List<Sales> findBySaleDateBetween(LocalDate from, LocalDate to);

    /** 기간 내 판매 전표 + 라인 + 품목까지 fetch (판매할인현황 집계용) */
    @Query("select distinct s from Sales s join fetch s.partner " +
            "left join fetch s.lines l left join fetch l.item " +
            "where s.saleDate between :from and :to " +
            "order by s.saleDate desc, s.id desc")
    List<Sales> findWithLinesBySaleDateBetween(LocalDate from, LocalDate to);

    /** 거래처별 매출 합계(=채권) */
    @Query("select s.partner.id as partnerId, coalesce(sum(s.totalAmount), 0) as total " +
            "from Sales s group by s.partner.id")
    List<PartnerAmount> sumTotalByPartner();

    interface PartnerAmount {
        Long getPartnerId();
        BigDecimal getTotal();
    }

    @Query("select coalesce(sum(s.supplyAmount),0) from Sales s")
    BigDecimal sumSupply();

    @Query("select coalesce(sum(s.vatAmount),0) from Sales s")
    BigDecimal sumVat();

    @Query("select coalesce(sum(s.totalAmount),0) from Sales s")
    BigDecimal sumTotal();
}
