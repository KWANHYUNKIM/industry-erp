package com.erp.groupware.repository;

import com.erp.groupware.domain.ShortMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ShortMessageRepository extends JpaRepository<ShortMessage, Long> {

    /** 받은 쪽지(기간). 보관 여부는 서비스에서 함(box)에 따라 가른다. */
    @Query("select m from ShortMessage m left join fetch m.sender left join fetch m.recipient left join fetch m.partner " +
            "where m.recipient.id = :userId and m.sentAt between :from and :to " +
            "order by m.sentAt desc, m.id desc")
    List<ShortMessage> findReceived(@Param("userId") Long userId,
                                    @Param("from") LocalDateTime from,
                                    @Param("to") LocalDateTime to);

    /** 보낸 쪽지(기간). 시스템 자동알림은 sender 가 없으므로 여기 걸리지 않는다. */
    @Query("select m from ShortMessage m left join fetch m.sender left join fetch m.recipient left join fetch m.partner " +
            "where m.sender.id = :userId and m.sentAt between :from and :to " +
            "order by m.sentAt desc, m.id desc")
    List<ShortMessage> findSent(@Param("userId") Long userId,
                                @Param("from") LocalDateTime from,
                                @Param("to") LocalDateTime to);

    /** 미확인 건수 배지. 보관함으로 옮긴 것은 제외. */
    long countByRecipientIdAndReadAtIsNullAndArchivedFalse(Long recipientId);
}
