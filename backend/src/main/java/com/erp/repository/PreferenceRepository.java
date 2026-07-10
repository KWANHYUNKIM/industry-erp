package com.erp.repository;

import com.erp.domain.Preference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PreferenceRepository extends JpaRepository<Preference, Long> {

    /** 단일 레코드 조회 (가장 먼저 등록된 1건). */
    Optional<Preference> findFirstByOrderByIdAsc();
}
