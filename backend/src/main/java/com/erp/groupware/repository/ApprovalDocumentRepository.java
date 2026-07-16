package com.erp.groupware.repository;

import com.erp.groupware.domain.ApprovalDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ApprovalDocumentRepository extends JpaRepository<ApprovalDocument, Long> {

    @Query("select distinct d from ApprovalDocument d " +
            "join fetch d.drafter " +
            "join fetch d.formTemplate " +
            "order by d.draftDate desc, d.id desc")
    List<ApprovalDocument> findAllWithRefs();

    /** 양식별 기안서 수. 0건인 양식만 삭제할 수 있다. */
    long countByFormTemplateId(Long formTemplateId);

    /**
     * 해당 기안일자에 이미 쓰인 일련번호의 최댓값. 없으면 0.
     * draft_no 는 '2026/07/10-2' 형태라 '-' 뒤가 일련번호다(날짜 구분자는 '/').
     * 삭제된 문서도 번호를 점유하므로 count 가 아니라 max 를 쓴다.
     */
    @Query(value = "select coalesce(max(cast(split_part(draft_no, '-', 2) as integer)), 0) " +
            "from approval_documents where draft_date = :date", nativeQuery = true)
    int maxDraftSeq(@Param("date") LocalDate date);
}
