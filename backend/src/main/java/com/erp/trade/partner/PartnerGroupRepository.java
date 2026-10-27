package com.erp.trade.partner;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PartnerGroupRepository extends JpaRepository<PartnerGroup, Long> {

    boolean existsByCode(String code);
}
