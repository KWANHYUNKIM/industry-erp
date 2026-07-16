package com.erp.accounting.repository;

import com.erp.accounting.domain.BankAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface BankAccountRepository extends JpaRepository<BankAccount, Long> {

    boolean existsByAccountNo(String accountNo);

    @Query("select b from BankAccount b join fetch b.glAccount order by b.bankName, b.accountNo")
    List<BankAccount> findAllWithAccount();

    /** 입출금 처리 시 잔액 행을 잠그고 조회 (동시 입출금이 잔액을 덮어쓰지 않도록) */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from BankAccount b where b.id = :id")
    Optional<BankAccount> findForUpdate(Long id);
}
