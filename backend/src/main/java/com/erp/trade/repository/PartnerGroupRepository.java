package com.erp.trade.repository;

import com.erp.trade.domain.PartnerGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PartnerGroupRepository extends JpaRepository<PartnerGroup, Long> {

    boolean existsByCode(String code);
}
