package com.erp.hr.insurance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InsuranceWorkplaceRepository extends JpaRepository<InsuranceWorkplace, Long> {
    List<InsuranceWorkplace> findAllByOrderByIdAsc();
    boolean existsByManageNo(String manageNo);
}
