package com.erp.groupware.repository;

import com.erp.groupware.domain.Mail;
import com.erp.groupware.domain.enums.MailStatus;
import com.erp.groupware.domain.enums.MailType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MailRepository extends JpaRepository<Mail, Long> {

    /** 수신함: 나에게 온 사내메일 (초안·지운함 제외) */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.type = com.erp.groupware.domain.enums.MailType.INTERNAL and m.recipient.id = :userId " +
            "and m.draft = false and m.deletedAt is null and m.spam = false " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findInbox(@Param("userId") Long userId);

    /** 발신함: 내가 보낸 사내메일 (초안·지운함 제외) */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.type = com.erp.groupware.domain.enums.MailType.INTERNAL and m.sender.id = :userId " +
            "and m.draft = false and m.deletedAt is null and m.spam = false " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findSent(@Param("userId") Long userId);

    /** 공용메일함: 회사 대표 메일함. 누구나 본다. (지운함 제외) */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.type = com.erp.groupware.domain.enums.MailType.SHARED and m.deletedAt is null and m.spam = false " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findShared();

    /** 임시보관함: 내가 저장한 초안 (지운함 제외) */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient " +
            "where m.sender.id = :userId and m.draft = true and m.deletedAt is null " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findDrafts(@Param("userId") Long userId);

    /** 지운함: 내가 보내거나 받은 메일 중 소프트삭제된 것 */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.deletedAt is not null and (m.sender.id = :userId or m.recipient.id = :userId) " +
            "order by m.deletedAt desc, m.id desc")
    List<Mail> findTrash(@Param("userId") Long userId);

    /** 스팸 메일함: 규칙에 걸렸거나 수동 지정된 메일. 공용메일은 누구나, 사내메일은 당사자만 본다. */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.spam = true and m.deletedAt is null " +
            "and (m.type = com.erp.groupware.domain.enums.MailType.SHARED " +
            "     or m.sender.id = :userId or m.recipient.id = :userId) " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findSpam(@Param("userId") Long userId);

    /** 공용메일 미처리 건수 (지운함 제외) */
    long countByTypeAndStatusNotAndDeletedAtIsNull(MailType type, MailStatus status);
}
