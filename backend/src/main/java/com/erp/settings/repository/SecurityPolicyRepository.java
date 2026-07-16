package com.erp.settings.repository;

import com.erp.settings.domain.SecurityPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SecurityPolicyRepository extends JpaRepository<SecurityPolicy, Long> {

    /** 단일 레코드 조회 (가장 먼저 등록된 1건). */
    Optional<SecurityPolicy> findFirstByOrderByIdAsc();
}
