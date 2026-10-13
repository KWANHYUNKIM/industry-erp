package com.erp.settings.collectsource;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CollectSourceRepository extends JpaRepository<CollectSource, Long> {
    List<CollectSource> findAllByOrderBySortOrderAscIdAsc();
}
