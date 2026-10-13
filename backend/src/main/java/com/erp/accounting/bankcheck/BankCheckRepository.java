package com.erp.accounting.bankcheck;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BankCheckRepository extends JpaRepository<BankCheck, Long> {

    boolean existsByCheckNo(String checkNo);

    java.util.Optional<BankCheck> findByCheckNo(String checkNo);

    /** 수표내역입력 증가 전표 한 장의 줄 — (종류, 날짜, 번호). */
    List<BankCheck> findByTypeAndIssueDateAndDirectInNoOrderByIdAsc(CheckType type, java.time.LocalDate date, Integer no);

    /** 수표내역입력 감소 전표 한 장의 줄. */
    List<BankCheck> findByTypeAndSettledDateAndDirectOutNoOrderByIdAsc(CheckType type, java.time.LocalDate date, Integer no);

    @Query("select c from BankCheck c " +
           "left join fetch c.partner left join fetch c.bankAccount " +
           "where c.issueDate >= :from and c.issueDate <= :to " +
           "order by c.issueDate desc, c.id desc")
    List<BankCheck> findAllWithRefs(@Param("from") java.time.LocalDate from,
                                    @Param("to") java.time.LocalDate to);
}
