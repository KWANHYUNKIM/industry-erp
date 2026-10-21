package com.erp.hr.employee;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EmployeeProfileRepository extends JpaRepository<EmployeeProfile, Long> {
    Optional<EmployeeProfile> findByEmployee_Id(Long employeeId);

    void deleteByEmployee_Id(Long employeeId);
}
