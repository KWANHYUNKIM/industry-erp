package com.erp.groupware.repository;

import com.erp.groupware.domain.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    /** 대화 열기: 최근 것부터 limit 만큼 (화면에서 뒤집어 시간순으로 그린다). */
    @Query("select m from ChatMessage m left join fetch m.sender where m.room.id = :roomId order by m.id desc")
    List<ChatMessage> findRecent(@Param("roomId") Long roomId, Pageable pageable);

    /** 폴링: 마지막으로 받은 것 이후만. */
    @Query("select m from ChatMessage m left join fetch m.sender " +
            "where m.room.id = :roomId and m.id > :afterId order by m.id")
    List<ChatMessage> findAfter(@Param("roomId") Long roomId, @Param("afterId") Long afterId);

    /**
     * 안 읽은 개수. 내가 보낸 것과 시스템 안내는 세지 않는다 —
     * 내 말에 배지가 붙으면 방을 열자마자 다시 미읽음으로 보이기 때문이다.
     */
    @Query("select count(m) from ChatMessage m " +
            "where m.room.id = :roomId and m.sender.id <> :userId and m.sentAt > :since")
    long countUnread(@Param("roomId") Long roomId,
                     @Param("userId") Long userId,
                     @Param("since") LocalDateTime since);

    /** 방 목록 미리보기용 — 방마다 마지막 메시지 한 건씩. */
    @Query("select m from ChatMessage m left join fetch m.sender left join fetch m.room where m.id in " +
            "(select max(x.id) from ChatMessage x where x.room.id in :roomIds group by x.room.id)")
    List<ChatMessage> findLatestOfRooms(@Param("roomIds") List<Long> roomIds);

    void deleteByRoomId(Long roomId);
}
