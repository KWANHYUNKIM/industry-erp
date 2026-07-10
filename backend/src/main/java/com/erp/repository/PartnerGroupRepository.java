package com.erp.repository;

import com.erp.domain.PartnerGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PartnerGroupRepository extends JpaRepository<PartnerGroup, Long> {

    boolean existsByCode(String code);
}
