package com.erp.groupware.approval;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ApprovalGroupRepository extends JpaRepository<ApprovalGroup, Long> {

    List<ApprovalGroup> findAllByOrderByCodeAsc();

    Optional<ApprovalGroup> findByCode(String code);
}
