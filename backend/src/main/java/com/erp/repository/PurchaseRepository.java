package com.erp.repository;

import com.erp.domain.Purchase;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * 기간 내 프로젝트별 구매원가 합계(공급가액). 자바에서 묶으면 LAZY 인 project 때문에
     * 전표 수만큼 쿼리가 나간다(N+1). 집계는 DB 에서 한 번에 한다.
     */
    @Query("select p.project.id as projectId, coalesce(sum(p.supplyAmount), 0) as amount, count(p) as count " +
            "from Purchase p where p.purchaseDate between :from and :to and p.project is not null " +
            "group by p.project.id")
    List<ProjectAmount> sumSupplyByProject(LocalDate from, LocalDate to);

    /** 프로젝트가 지정되지 않은 구매의 합계 (미지정) */
    @Query("select coalesce(sum(p.supplyAmount), 0) from Purchase p " +
            "where p.purchaseDate between :from and :to and p.project is null")
    BigDecimal sumSupplyWithoutProject(LocalDate from, LocalDate to);

    interface ProjectAmount {
        Long getProjectId();
        BigDecimal getAmount();
        long getCount();
    }

    /** 통합검색: 전표번호·거래처명 부분일치 상위 N건 */
    @Query("select p from Purchase p join fetch p.partner bp " +
           "where lower(p.docNo) like :q or lower(bp.name) like :q " +
           "order by p.purchaseDate desc, p.id desc")
    List<Purchase> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(p) from Purchase p where lower(p.docNo) like :q or lower(p.partner.name) like :q")
    long searchCount(@Param("q") String q);

}
