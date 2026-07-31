package com.erp.accounting.repository;

import com.erp.accounting.domain.EvidenceAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface EvidenceAttachmentRepository extends JpaRepository<EvidenceAttachment, Long> {

    /**
     * 증빙센터 목록 — 전표일자 기간으로 1차 필터. 나머지 조건은 서비스에서 거른다.
     * 날짜는 항상 non-null 로 넘긴다(PostgreSQL 42P18 회피 — 다른 조회들과 같은 규칙).
     */
    @Query("select e from EvidenceAttachment e left join fetch e.file " +
            "where e.docDate between :from and :to " +
            "order by e.docDate desc, e.id desc")
    List<EvidenceAttachment> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 전표 상세의 증빙 패널 */
    @Query("select e from EvidenceAttachment e left join fetch e.file " +
            "where e.entityType = :entityType and e.entityId = :entityId order by e.id")
    List<EvidenceAttachment> findByTarget(@Param("entityType") String entityType,
                                          @Param("entityId") Long entityId);
}
