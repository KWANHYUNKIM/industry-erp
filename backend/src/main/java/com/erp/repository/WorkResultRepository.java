package com.erp.repository;

import com.erp.domain.WorkResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkResultRepository extends JpaRepository<WorkResult, Long> {

    @Query("select wr from WorkResult wr " +
            "left join fetch wr.workOrder " +
            "order by wr.workDate desc, wr.id desc")
    List<WorkResult> findAllWithRefs();
}
