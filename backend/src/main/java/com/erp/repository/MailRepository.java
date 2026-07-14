package com.erp.repository;

import com.erp.domain.Mail;
import com.erp.domain.enums.MailStatus;
import com.erp.domain.enums.MailType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MailRepository extends JpaRepository<Mail, Long> {

    /** 수신함: 나에게 온 사내메일 */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.type = com.erp.domain.enums.MailType.INTERNAL and m.recipient.id = :userId " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findInbox(@Param("userId") Long userId);

    /** 발신함: 내가 보낸 사내메일 */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.type = com.erp.domain.enums.MailType.INTERNAL and m.sender.id = :userId " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findSent(@Param("userId") Long userId);

    /** 공용메일함: 회사 대표 메일함. 누구나 본다. */
    @Query("select m from Mail m left join fetch m.sender left join fetch m.recipient left join fetch m.assignee " +
            "where m.type = com.erp.domain.enums.MailType.SHARED " +
            "order by m.sentAt desc, m.id desc")
    List<Mail> findShared();

    long countByTypeAndStatusNot(MailType type, MailStatus status);
}
