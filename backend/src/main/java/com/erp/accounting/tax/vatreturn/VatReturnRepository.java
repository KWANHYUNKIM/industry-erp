package com.erp.accounting.tax.vatreturn;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VatReturnRepository extends JpaRepository<VatReturn, Long> {

    boolean existsByAttributionYearAndMonthFromAndMonthToAndReturnKind(Integer year, Integer monthFrom, Integer monthTo, VatReturnKind kind);

    List<VatReturn> findByAttributionYearBetween(Integer fromYear, Integer toYear);
}
