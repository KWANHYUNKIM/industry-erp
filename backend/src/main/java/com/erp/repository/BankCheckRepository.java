package com.erp.repository;

import com.erp.domain.BankCheck;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BankCheckRepository extends JpaRepository<BankCheck, Long> {

    boolean existsByCheckNo(String checkNo);

    @Query("select c from BankCheck c " +
           "left join fetch c.partner left join fetch c.bankAccount " +
           "order by c.issueDate desc, c.id desc")
    List<BankCheck> findAllWithRefs();
}
