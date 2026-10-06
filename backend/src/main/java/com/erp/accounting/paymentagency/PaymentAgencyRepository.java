package com.erp.accounting.paymentagency;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentAgencyRepository extends JpaRepository<PaymentAgency, Long> {
    boolean existsByCode(String code);
}
