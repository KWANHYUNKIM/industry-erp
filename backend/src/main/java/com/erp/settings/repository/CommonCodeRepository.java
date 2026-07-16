package com.erp.settings.repository;

import com.erp.settings.domain.CommonCode;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommonCodeRepository extends JpaRepository<CommonCode, Long> {

    boolean existsByGroupIdAndCode(Long groupId, String code);
}
