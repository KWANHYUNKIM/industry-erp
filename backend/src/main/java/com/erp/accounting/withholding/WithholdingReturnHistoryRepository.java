package com.erp.accounting.withholding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WithholdingReturnHistoryRepository extends JpaRepository<WithholdingReturnHistory, Long> {

    List<WithholdingReturnHistory> findByWithholdingReturnIdOrderByChangedAtAscIdAsc(Long returnId);
}
