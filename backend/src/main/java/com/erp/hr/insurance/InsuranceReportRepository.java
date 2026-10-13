package com.erp.hr.insurance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface InsuranceReportRepository extends JpaRepository<InsuranceReport, Long> {

    @Query("select r from InsuranceReport r join fetch r.employee left join fetch r.pensionWorkplace " +
           "left join fetch r.healthWorkplace left join fetch r.employmentWorkplace left join fetch r.accidentWorkplace " +
           "where r.reportDate between :from and :to order by r.reportDate desc, r.reportSeq desc")
    List<InsuranceReport> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select coalesce(max(r.reportSeq), 0) from InsuranceReport r where r.reportDate = :date")
    int maxSeq(@Param("date") LocalDate date);
}
