package com.erp.production.repository;

import com.erp.production.domain.ProductionPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProductionPlanRepository extends JpaRepository<ProductionPlan, Long> {

    @Query("select p from ProductionPlan p join fetch p.product " +
            "order by p.planWeek desc, p.id desc")
    List<ProductionPlan> findAllWithProduct();

    /**
     * 생산계획기간(원본 조건)으로 좁혀 읽는다.
     *
     * <p>주차는 <code>2026-W28</code> 꼴의 문자열이고 자리수가 고정이라 <b>글자 비교가 곧
     * 주차 비교</b>다 — 화면이 지금 브라우저에서 하던 셈(<code>planWeek &lt; weekFrom</code>)을
     * 그대로 DB 로 옮긴 것이라 걸러지는 줄이 달라지지 않는다. 날짜로 바꿔 재지 않는 이유는,
     * 우리 어디에도 날짜→주차 변환이 없어서 새 규칙을 지어내게 되기 때문이다.
     */
    @Query("select p from ProductionPlan p join fetch p.product " +
            "where (:weekFrom is null or p.planWeek >= :weekFrom) " +
            "and (:weekTo is null or p.planWeek <= :weekTo) " +
            "order by p.planWeek desc, p.id desc")
    List<ProductionPlan> findWithProductInWeeks(@Param("weekFrom") String weekFrom,
                                                @Param("weekTo") String weekTo);

    /** 그 작업지시에서 나온 계획들. 작업지시를 지울 때 연결을 푼다. */
    java.util.List<ProductionPlan> findByWorkOrder_Id(Long workOrderId);
}
