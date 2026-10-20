package com.erp.groupware.drive;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DriveDocumentRepository extends JpaRepository<DriveDocument, Long> {

    @Query("select d from DriveDocument d order by d.updatedAt desc, d.id desc")
    List<DriveDocument> findAllOrdered();

    /** 원본 — 폴더 안에 파일을 올리면 그 폴더 줄의 최종수정일자가 올린 시각으로 바뀐다(2026-10-20 실측). */
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true)
    @Query("update DriveDocument d set d.updatedAt = :at where d.id = :id")
    void touch(@org.springframework.data.repository.query.Param("id") Long id,
               @org.springframework.data.repository.query.Param("at") java.time.LocalDateTime at);
}
