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

    /** 작업지시에 붙은 생산실적 수. 작업지시를 지워도 되는지 판단한다. */
    long countByWorkOrder_Id(Long workOrderId);
}
