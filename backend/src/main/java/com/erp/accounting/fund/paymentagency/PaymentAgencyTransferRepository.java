package com.erp.accounting.fund.paymentagency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentAgencyTransferRepository extends JpaRepository<PaymentAgencyTransfer, Long> {
    List<PaymentAgencyTransfer> findByPaymentAgencyIdOrderByIdAsc(Long paymentAgencyId);
}
