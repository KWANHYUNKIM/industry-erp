package com.erp.accounting.repository;

import com.erp.accounting.domain.BankCheck;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BankCheckRepository extends JpaRepository<BankCheck, Long> {

    boolean existsByCheckNo(String checkNo);

    @Query("select c from BankCheck c " +
           "left join fetch c.partner left join fetch c.bankAccount " +
           "where c.issueDate >= :from and c.issueDate <= :to " +
           "order by c.issueDate desc, c.id desc")
    List<BankCheck> findAllWithRefs(@Param("from") java.time.LocalDate from,
                                    @Param("to") java.time.LocalDate to);
}
