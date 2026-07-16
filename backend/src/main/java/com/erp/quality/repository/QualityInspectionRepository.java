package com.erp.quality.repository;

import com.erp.quality.domain.QualityInspection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface QualityInspectionRepository extends JpaRepository<QualityInspection, Long> {

    @Query("select q from QualityInspection q join fetch q.item " +
            "order by q.inspectionDate desc, q.id desc")
    List<QualityInspection> findAllWithRefs();
}
