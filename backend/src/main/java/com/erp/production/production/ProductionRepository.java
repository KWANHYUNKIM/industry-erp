package com.erp.production.production;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ProductionRepository extends JpaRepository<Production, Long> {

    @Query("select p from Production p join fetch p.product join fetch p.warehouse left join fetch p.workOrder " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select p from Production p join fetch p.product join fetch p.warehouse left join fetch p.workOrder " +
            "where p.productionDate between :from and :to " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * 원가 [실제노무비] 재료 — 기간 안 생산의 [제품id, 노무시간(분), 생산수량]. 엔티티를 올리지 않는다(2026-10-31).
     * 예전 CostService 는 품목마다 전 기간 생산을 {@link #findAllWithRefs()} 로 다시 올렸다.
     */
    @Query("select p.product.id, p.laborMinutes, p.producedQty from Production p " +
            "where p.productionDate between :from and :to")
    List<Object[]> findCostLaborRowsBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 위와 같되 기간이 yyyy-MM 이 아닐 때 — 일자 문자열이 그 앞머리로 시작하는 것(예전 startsWith 그대로). */
    @Query("select p.product.id, p.laborMinutes, p.producedQty from Production p " +
            "where substring(cast(p.productionDate as String), 1, length(:prefix)) = :prefix")
    List<Object[]> findCostLaborRowsByDatePrefix(@Param("prefix") String prefix);

    /** 원가계산 — 그 달 생산실적. 차례는 id(예전 findAll() 의 물리 차례에 가장 가깝다). 소모 줄 · 제품은 지연로딩. */
    @Query("select p from Production p where p.productionDate between :from and :to order by p.id")
    List<Production> findByProductionDateBetweenOrderById(@Param("from") LocalDate from, @Param("to") LocalDate to);

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

    /** 생산입고 I(BOM기준소모) 줄 중 이 제품이 이 기간에 만든 것 — BOM 저장 때 [재계산] 이 쓴다. */
    @Query("select p from Production p join fetch p.product join fetch p.warehouse left join fetch p.fromWarehouse " +
            "where p.product.id = :productId and p.entryType = com.erp.production.production.ProductionEntryType.I " +
            "and p.productionDate between :from and :to order by p.productionDate, p.id")
    List<Production> findRecalcTargets(@Param("productId") Long productId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 작업지시에 붙은 생산실적 수. 작업지시를 지워도 되는지 판단한다. */
    long countByWorkOrder_Id(Long workOrderId);

    /** 전표 하나의 줄들(줄 차례대로). */
    @Query("select p from Production p join fetch p.product join fetch p.warehouse left join fetch p.workOrder " +
            "left join fetch p.fromWarehouse left join fetch p.process " +
            "where p.prodNo = :prodNo order by p.lineNo, p.id")
    List<Production> findSlip(@Param("prodNo") String prodNo);

    /** 작업내역 전표에서 [연결전표] 로 만든 생산입고 줄들. */
    @Query("select p from Production p join fetch p.product join fetch p.warehouse left join fetch p.workOrder " +
            "where p.workResultNo = :no order by p.prodNo, p.lineNo")
    List<Production> findByWorkResultNo(@Param("no") String no);
}
