package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PayDirectAmountRepository extends JpaRepository<PayDirectAmount, Long> {

    List<PayDirectAmount> findByPayMonth(String payMonth);

    List<PayDirectAmount> findByPayMonthAndEmployeeId(String payMonth, Long employeeId);

    void deleteByPayMonthAndEmployeeId(String payMonth, Long employeeId);

    void deleteByPayMonth(String payMonth);
}
