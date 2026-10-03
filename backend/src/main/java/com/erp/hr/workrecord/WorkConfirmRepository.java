package com.erp.hr.workrecord;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkConfirmRepository extends JpaRepository<WorkConfirm, Long> {

    @Query("select c from WorkConfirm c join fetch c.employee e join fetch c.payItem i " +
           "where c.payMonth between :from and :to order by c.payMonth, e.name, i.sortOrder, i.code")
    List<WorkConfirm> findInMonths(String from, String to);

    @Query("select c from WorkConfirm c join fetch c.payItem where c.payMonth = :payMonth and c.employee.id = :employeeId")
    List<WorkConfirm> findFor(String payMonth, Long employeeId);

    void deleteByPayMonth(String payMonth);
}
