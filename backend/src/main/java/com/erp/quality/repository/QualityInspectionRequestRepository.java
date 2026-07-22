package com.erp.quality.repository;

import com.erp.quality.domain.QualityInspectionRequest;
import com.erp.quality.domain.QualityRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface QualityInspectionRequestRepository extends JpaRepository<QualityInspectionRequest, Long> {

    @Query("select r from QualityInspectionRequest r join fetch r.item " +
            "order by r.requestDate desc, r.id desc")
    List<QualityInspectionRequest> findAllWithRefs();

    @Query("select r from QualityInspectionRequest r join fetch r.item " +
            "where r.status = :status " +
            "order by r.requestDate desc, r.id desc")
    List<QualityInspectionRequest> findByStatusWithRefs(@Param("status") QualityRequestStatus status);
}
