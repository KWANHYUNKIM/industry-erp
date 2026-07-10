package com.erp.repository;

import com.erp.domain.DriveDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DriveDocumentRepository extends JpaRepository<DriveDocument, Long> {

    @Query("select d from DriveDocument d order by d.updatedAt desc, d.id desc")
    List<DriveDocument> findAllOrdered();
}
