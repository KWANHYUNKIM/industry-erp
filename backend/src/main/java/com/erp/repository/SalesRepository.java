package com.erp.repository;

import com.erp.domain.Sales;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * 기간 내 프로젝트별 매출 합계(공급가액). 전표를 전부 읽어 자바에서 묶으면 LAZY 인
     * project 를 행마다 건드려 전표 수만큼 쿼리가 나간다(N+1). 집계는 DB 에서 한 번에 한다.
     */
    @Query("select s.project.id as projectId, coalesce(sum(s.supplyAmount), 0) as amount, count(s) as count " +
            "from Sales s where s.saleDate between :from and :to and s.project is not null " +
            "group by s.project.id")
    List<ProjectAmount> sumSupplyByProject(LocalDate from, LocalDate to);

    /** 프로젝트가 지정되지 않은 판매의 매출 합계 (미지정) */
    @Query("select coalesce(sum(s.supplyAmount), 0) from Sales s " +
            "where s.saleDate between :from and :to and s.project is null")
    BigDecimal sumSupplyWithoutProject(LocalDate from, LocalDate to);

    interface ProjectAmount {
        Long getProjectId();
        BigDecimal getAmount();
        long getCount();
    }

    @Query("select coalesce(sum(s.supplyAmount),0) from Sales s")
    BigDecimal sumSupply();

    @Query("select coalesce(sum(s.vatAmount),0) from Sales s")
    BigDecimal sumVat();

    @Query("select coalesce(sum(s.totalAmount),0) from Sales s")
    BigDecimal sumTotal();

    /** 통합검색: 전표번호·거래처명 부분일치 상위 N건 (거래처 fetch join 으로 N+1 방지) */
    @Query("select s from Sales s join fetch s.partner p " +
           "where lower(s.docNo) like :q or lower(p.name) like :q " +
           "order by s.saleDate desc, s.id desc")
    List<Sales> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(s) from Sales s where lower(s.docNo) like :q or lower(s.partner.name) like :q")
    long searchCount(@Param("q") String q);

}
