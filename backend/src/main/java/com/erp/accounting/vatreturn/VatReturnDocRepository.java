package com.erp.accounting.vatreturn;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VatReturnDocRepository extends JpaRepository<VatReturnDoc, Long> {

    List<VatReturnDoc> findByVatReturnId(Long vatReturnId);

    Optional<VatReturnDoc> findByVatReturnIdAndDocCode(Long vatReturnId, String docCode);
}
