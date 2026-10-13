package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EmployeePayrollSettingRepository extends JpaRepository<EmployeePayrollSetting, Long> {

    Optional<EmployeePayrollSetting> findByEmployeeId(Long employeeId);

    void deleteByEmployeeId(Long employeeId);
}
