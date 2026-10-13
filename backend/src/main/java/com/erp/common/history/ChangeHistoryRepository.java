package com.erp.common.history;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChangeHistoryRepository extends JpaRepository<ChangeHistory, Long> {

    List<ChangeHistory> findByTargetAndTargetIdOrderByWorkedAtAscIdAsc(String target, Long targetId);
}
