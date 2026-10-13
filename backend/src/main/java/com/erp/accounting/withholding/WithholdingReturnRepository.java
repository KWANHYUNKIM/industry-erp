package com.erp.accounting.withholding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WithholdingReturnRepository extends JpaRepository<WithholdingReturn, Long> {

    List<WithholdingReturn> findAllByOrderByAttributionMonthDescIdDesc();

    boolean existsByAttributionMonthAndPayMonthAndFilingType(String attributionMonth, String payMonth,
                                                            WithholdingFilingType filingType);
}
