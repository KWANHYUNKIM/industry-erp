package com.erp.quality.repository;

import com.erp.quality.domain.QualityInspection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;

import java.util.List;

public interface QualityInspectionRepository extends JpaRepository<QualityInspection, Long> {

    @Query("select q from QualityInspection q join fetch q.item " +
            "order by q.inspectionDate desc, q.id desc")
    List<QualityInspection> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select q from QualityInspection q join fetch q.item " +
            "where q.inspectionDate between :from and :to " +
            "order by q.inspectionDate desc, q.id desc")
    List<QualityInspection> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
