package com.erp.accounting.repository;

import com.erp.accounting.domain.MedicalDeviceReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MedicalDeviceReportRepository extends JpaRepository<MedicalDeviceReport, Long> {

    /** 송신이력 — 최근 보고월 먼저. 파일 메타까지 한 번에 가져온다. */
    @Query("select r from MedicalDeviceReport r left join fetch r.file order by r.reportMonth desc, r.id desc")
    List<MedicalDeviceReport> findAllByOrderByReportMonthDescIdDesc();
}
