package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface EmployeePayItemRepository extends JpaRepository<EmployeePayItem, Long> {

    @Query("select e from EmployeePayItem e join fetch e.payItem where e.employeeId = :employeeId")
    List<EmployeePayItem> findWithItemByEmployeeId(Long employeeId);

    void deleteByEmployeeId(Long employeeId);

    boolean existsByPayItem_Id(Long payItemId);
}
