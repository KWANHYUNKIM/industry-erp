package com.erp.accounting.vatmedia;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VatMediaFileRepository extends JpaRepository<VatMediaFile, Long> {

    boolean existsByAttributionYearAndMonthFromAndMonthTo(Integer year, Integer monthFrom, Integer monthTo);

    List<VatMediaFile> findByAttributionYearBetween(Integer fromYear, Integer toYear);
}
