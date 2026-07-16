package com.erp.production.repository;

import com.erp.production.domain.MaterialIssue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MaterialIssueRepository extends JpaRepository<MaterialIssue, Long> {

    @Query("select mi from MaterialIssue mi " +
            "join fetch mi.item " +
            "left join fetch mi.warehouse " +
            "left join fetch mi.workOrder " +
            "order by mi.issueDate desc, mi.id desc")
    List<MaterialIssue> findAllWithRefs();
}
