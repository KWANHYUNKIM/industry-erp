package com.erp.accounting.tax.yearend;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaxSettlementRepository extends JpaRepository<TaxSettlement, Long> {

    List<TaxSettlement> findByAttributionYearAndKindOrderByIdAsc(int attributionYear, TaxSettlementKind kind);

    Optional<TaxSettlement> findByAttributionYearAndEmployeeIdAndKind(int attributionYear, Long employeeId, TaxSettlementKind kind);

    List<TaxSettlement> findByEmployeeIdInAndKind(java.util.Collection<Long> employeeIds, TaxSettlementKind kind);
}
