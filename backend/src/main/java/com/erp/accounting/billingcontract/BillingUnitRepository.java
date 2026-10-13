package com.erp.accounting.billingcontract;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BillingUnitRepository extends JpaRepository<BillingUnit, Long> {
    List<BillingUnit> findAllByOrderByCodeAsc();
}
