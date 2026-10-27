package com.erp.accounting.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AccountRemarkRepository extends JpaRepository<AccountRemark, Long> {
    List<AccountRemark> findByAccountIdOrderByCodeAsc(Long accountId);
    boolean existsByAccountIdAndCode(Long accountId, String code);
}
