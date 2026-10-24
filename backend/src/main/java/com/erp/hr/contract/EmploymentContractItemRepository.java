package com.erp.hr.contract;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EmploymentContractItemRepository extends JpaRepository<EmploymentContractItem, Long> {
    List<EmploymentContractItem> findByContractIdOrderBySortOrderAscIdAsc(Long contractId);
}
