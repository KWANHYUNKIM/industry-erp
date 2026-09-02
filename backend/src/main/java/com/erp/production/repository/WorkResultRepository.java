package com.erp.production.repository;

import com.erp.production.domain.WorkResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkResultRepository extends JpaRepository<WorkResult, Long> {

    @Query("select wr from WorkResult wr " +
            "left join fetch wr.workOrder wo " +
            "left join fetch wo.product " +
            "left join fetch wr.processMaster " +
            "left join fetch wr.resource " +
            "left join fetch wr.warehouse " +
            // 작업품목까지 같이 가져온다 — open-in-view 가 꺼져 있어 화면에서 초기화되지 않는다
            "left join fetch wr.workItem " +
            "order by wr.workDate desc, wr.id desc")
    List<WorkResult> findAllWithRefs();
}
