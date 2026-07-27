package com.erp.settings.repository;

import com.erp.settings.domain.CollectSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CollectSourceRepository extends JpaRepository<CollectSource, Long> {
    List<CollectSource> findAllByOrderBySortOrderAscIdAsc();
}
