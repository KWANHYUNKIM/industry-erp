package com.erp.accounting.cost.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ProjectPlanLineRepository extends JpaRepository<ProjectPlanLine, Long> {

    @Query("select distinct l from ProjectPlanLine l left join fetch l.months " +
            "where l.plan.id = :planId order by l.id asc")
    List<ProjectPlanLine> findByPlanIdWithMonths(@Param("planId") Long planId);

    @Query("select distinct l from ProjectPlanLine l join fetch l.plan left join fetch l.months " +
            "where l.plan.id in :planIds")
    List<ProjectPlanLine> findByPlanIdsWithMonths(@Param("planIds") Collection<Long> planIds);

    List<ProjectPlanLine> findByPlanId(Long planId);
}
