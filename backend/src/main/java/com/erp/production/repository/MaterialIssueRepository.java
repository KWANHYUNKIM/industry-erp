package com.erp.production.repository;

import com.erp.production.domain.MaterialIssue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MaterialIssueRepository extends JpaRepository<MaterialIssue, Long> {

    @Query("select mi from MaterialIssue mi " +
            "join fetch mi.item " +
            "left join fetch mi.warehouse " +
            "left join fetch mi.toWarehouse " +
            // 생산품목을 함께 가져온다 — 응답이 작업지시의 품목코드·품명을 싣기 때문에
            // fetch 없이 하면 전표 수만큼 쿼리가 더 나간다(N+1).
            "left join fetch mi.workOrder wo left join fetch wo.product " +
            "order by mi.issueDate desc, mi.id desc")
    List<MaterialIssue> findAllWithRefs();
}
