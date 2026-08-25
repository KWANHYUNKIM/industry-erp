package com.erp.groupware.repository;

import com.erp.groupware.domain.ChatRoomMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMember, Long> {

    Optional<ChatRoomMember> findByRoomIdAndUserId(Long roomId, Long userId);

    /** 방 참여자(이름 표시용). */
    @Query("select m from ChatRoomMember m join fetch m.user where m.room.id = :roomId order by m.joinedAt, m.id")
    List<ChatRoomMember> findByRoom(@Param("roomId") Long roomId);

    /** 여러 방의 참여자를 한 번에 (방 목록에서 N+1 회피). */
    @Query("select m from ChatRoomMember m join fetch m.user where m.room.id in :roomIds order by m.joinedAt, m.id")
    List<ChatRoomMember> findByRooms(@Param("roomIds") List<Long> roomIds);

    long countByRoomId(Long roomId);
}
