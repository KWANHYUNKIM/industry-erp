package com.erp.groupware.repository;

import com.erp.groupware.domain.CrmActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CrmActivityRepository extends JpaRepository<CrmActivity, Long> {

    @Query("select c from CrmActivity c join fetch c.partner " +
            "order by c.activityDate desc, c.id desc")
    List<CrmActivity> findAllWithRefs();
}
