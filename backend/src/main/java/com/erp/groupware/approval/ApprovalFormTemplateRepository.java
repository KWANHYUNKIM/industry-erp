package com.erp.groupware.approval;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ApprovalFormTemplateRepository extends JpaRepository<ApprovalFormTemplate, Long> {

    Optional<ApprovalFormTemplate> findByCode(String code);

    List<ApprovalFormTemplate> findByActiveTrueOrderBySortOrderAscCodeAsc();
}
