package com.erp.production.repository;

import com.erp.production.domain.Production;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ProductionRepository extends JpaRepository<Production, Long> {

    @Query("select p from Production p join fetch p.product join fetch p.warehouse join fetch p.workOrder " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select p from Production p join fetch p.product join fetch p.warehouse join fetch p.workOrder " +
            "where p.productionDate between :from and :to " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * <b>지시일</b>로 걸러 온다 — 생산일이 아니다.
     *
     * <p>작업지시별로 묶어 진행을 세는 화면(작업지시진행현황·작업효율분석)이 쓴다. 그 화면의
     * 기간은 <b>지시일</b>이고, 기간 안의 지시에 <b>그 밖의 날에 찍힌 실적</b>이 있으면
     * 그것까지 세어야 한다. 생산일로 자르면 진행이 덜 된 것처럼 보인다 — 그래서
     * 그 화면들은 여태 <b>전 기간을 통째로</b> 받아 브라우저에서 묶고 있었다(2026-09-21 실측 202KB).
     */
    @Query("select p from Production p join fetch p.product join fetch p.warehouse join fetch p.workOrder wo " +
            "where wo.orderDate between :from and :to " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findWithRefsByOrderPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 작업지시에 붙은 생산실적 수. 작업지시를 지워도 되는지 판단한다. */
    long countByWorkOrder_Id(Long workOrderId);
}
