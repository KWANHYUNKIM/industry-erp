package com.erp.groupware.repository;

import com.erp.groupware.domain.ChatRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    Optional<ChatRoom> findByDirectKey(String directKey);

    /** 내가 참여 중인 방. 마지막 대화가 최근인 순. */
    @Query("select r from ChatRoom r where r.id in " +
            "(select m.room.id from ChatRoomMember m where m.user.id = :userId) " +
            "order by coalesce(r.lastMessageAt, r.createdAt) desc, r.id desc")
    List<ChatRoom> findMine(@Param("userId") Long userId);
}
