package com.erp.accounting.vatreturn;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VatReturnHistoryRepository extends JpaRepository<VatReturnHistory, Long> {

    List<VatReturnHistory> findByVatReturnIdOrderByChangedAtAscIdAsc(Long vatReturnId);
}
