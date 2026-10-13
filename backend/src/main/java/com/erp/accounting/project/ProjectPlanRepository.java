package com.erp.accounting.project;

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

    /** 프로젝트계획/실적현황(E040637) — 고른 프로젝트들의 계획 전부. */
    @Query("select p from ProjectPlan p join fetch p.project " +
            "where p.project.id in :projectIds " +
            "order by p.project.code asc, p.planYear asc")
    List<ProjectPlan> findByProjectIdsWithProject(@Param("projectIds") java.util.Collection<Long> projectIds);
}
