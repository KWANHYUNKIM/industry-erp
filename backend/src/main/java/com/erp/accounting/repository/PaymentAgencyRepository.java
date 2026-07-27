package com.erp.accounting.repository;

import com.erp.accounting.domain.PaymentAgency;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentAgencyRepository extends JpaRepository<PaymentAgency, Long> {
    boolean existsByCode(String code);
    long countByCodeStartingWith(String prefix);
}
