package com.erp.production.repository;

import com.erp.production.domain.ProductionProcess;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProcessRepository extends JpaRepository<ProductionProcess, Long> {

    boolean existsByCode(String code);

    /** 작업내역의 자유입력 공정명을 마스터와 연결하기 위한 조회 */
    Optional<ProductionProcess> findByName(String name);
}
