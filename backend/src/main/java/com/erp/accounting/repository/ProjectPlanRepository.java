package com.erp.accounting.repository;

import com.erp.accounting.domain.ProjectPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProjectPlanRepository extends JpaRepository<ProjectPlan, Long> {

    @Query("select p from ProjectPlan p join fetch p.project " +
            "where p.planYear = :year " +
            "order by p.project.code asc")
    List<ProjectPlan> findByYearWithProject(@Param("year") int year);

    @Query("select p from ProjectPlan p join fetch p.project " +
            "order by p.planYear desc, p.project.code asc")
    List<ProjectPlan> findAllWithProject();
}
