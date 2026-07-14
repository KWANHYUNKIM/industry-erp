package com.erp.repository;

import com.erp.domain.ApprovalLinePreset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ApprovalLinePresetRepository extends JpaRepository<ApprovalLinePreset, Long> {

    boolean existsByName(String name);

    @Query("select distinct p from ApprovalLinePreset p " +
           "left join fetch p.steps s left join fetch s.approver " +
           "left join fetch p.formTemplate " +
           "order by p.name")
    List<ApprovalLinePreset> findAllWithSteps();
}
