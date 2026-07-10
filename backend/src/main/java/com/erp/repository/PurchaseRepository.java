package com.erp.repository;

import com.erp.domain.Purchase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface PurchaseRepository extends JpaRepository<Purchase, Long> {

    @Query("select p from Purchase p join fetch p.partner join fetch p.warehouse " +
            "order by p.purchaseDate desc, p.id desc")
    List<Purchase> findAllWithRefs();

    /** 기간 내 구매 전표 (이익현황 집계용) */
    List<Purchase> findByPurchaseDateBetween(LocalDate from, LocalDate to);

    /** 기간 내 구매 전표 + 라인 + 품목까지 fetch (구매/외주 할인현황 집계용) */
    @Query("select distinct p from Purchase p join fetch p.partner " +
            "left join fetch p.lines l left join fetch l.item " +
            "where p.purchaseDate between :from and :to " +
            "order by p.purchaseDate desc, p.id desc")
    List<Purchase> findWithLinesByPurchaseDateBetween(LocalDate from, LocalDate to);

    /** 거래처별 매입 합계(=채무) */
    @Query("select p.partner.id as partnerId, coalesce(sum(p.totalAmount), 0) as total " +
            "from Purchase p group by p.partner.id")
    List<PartnerAmount> sumTotalByPartner();

    interface PartnerAmount {
        Long getPartnerId();
        BigDecimal getTotal();
    }

    @Query("select coalesce(sum(p.supplyAmount),0) from Purchase p")
    BigDecimal sumSupply();

    @Query("select coalesce(sum(p.vatAmount),0) from Purchase p")
    BigDecimal sumVat();

    @Query("select coalesce(sum(p.totalAmount),0) from Purchase p")
    BigDecimal sumTotal();
}
