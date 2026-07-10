package com.erp.repository;

import com.erp.domain.BusinessPartner;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BusinessPartnerRepository extends JpaRepository<BusinessPartner, Long> {

    boolean existsByCode(String code);
}
