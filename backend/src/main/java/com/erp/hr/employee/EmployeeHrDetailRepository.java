package com.erp.hr.employee;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EmployeeHrDetailRepository extends JpaRepository<EmployeeHrDetail, Long> {

    List<EmployeeHrDetail> findByEmployee_IdAndCategoryOrderByLineNo(Long employeeId, HrDetailCategory category);

    List<EmployeeHrDetail> findByEmployee_IdOrderByCategoryAscLineNoAsc(Long employeeId);

    void deleteByEmployee_IdAndCategory(Long employeeId, HrDetailCategory category);
}
