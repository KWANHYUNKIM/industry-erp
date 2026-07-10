package com.erp.repository;

import com.erp.domain.ApprovalDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ApprovalDocumentRepository extends JpaRepository<ApprovalDocument, Long> {

    @Query("select distinct d from ApprovalDocument d " +
            "join fetch d.drafter " +
            "order by d.draftDate desc, d.id desc")
    List<ApprovalDocument> findAllWithRefs();
}
