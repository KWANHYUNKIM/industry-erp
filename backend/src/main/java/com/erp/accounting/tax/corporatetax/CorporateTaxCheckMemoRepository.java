package com.erp.accounting.tax.corporatetax;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CorporateTaxCheckMemoRepository extends JpaRepository<CorporateTaxCheckMemo, Long> {

    List<CorporateTaxCheckMemo> findByBaseYearAndSectionNoOrderByMemoDateDescIdDesc(Integer baseYear, Integer sectionNo);
}
