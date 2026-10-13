package com.erp.groupware.drive;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

public interface DriveHistoryRepository extends JpaRepository<DriveHistory, Long> {

    @Query("select h from DriveHistory h join fetch h.document d where d.id in :ids order by h.createdAt desc, h.id desc")
    List<DriveHistory> findByDocumentIds(Collection<Long> ids);
}
