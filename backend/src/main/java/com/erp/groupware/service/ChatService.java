package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.service.UserService;
import com.erp.common.ApiException;
import com.erp.groupware.domain.ChatMessage;
import com.erp.groupware.domain.ChatRoom;
import com.erp.groupware.domain.ChatRoomMember;
import com.erp.groupware.dto.ChatDtos.ChatMemberResponse;
import com.erp.groupware.dto.ChatDtos.ChatMessageResponse;
import com.erp.groupware.dto.ChatDtos.ChatRoomResponse;
import com.erp.groupware.repository.ChatMessageRepository;
import com.erp.groupware.repository.ChatRoomMemberRepository;
import com.erp.groupware.repository.ChatRoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 사내 메신저. 1:1·그룹 대화방과 그 안의 메시지를 다룬다.
 *
 * <p>실시간 전송(WebSocket)은 쓰지 않는다. 이 앱은 회사별 스키마 멀티테넌시라 소켓 세션마다
 * 테넌트를 다시 붙여야 하는데, 사내 인원 규모에서 얻는 이득보다 복잡도가 크다.
 * 대신 화면이 {@code afterId} 로 증분 폴링한다 — 새 메시지만 내려가므로 응답이 작다.
 *
 * <p>읽음은 참여자별 {@code lastReadAt} 한 값으로 관리한다(→ {@link ChatRoomMember}).
 * 미읽음 집계에서 내가 보낸 메시지와 시스템 안내는 제외한다.
 */
@Service
@RequiredArgsConstructor
public class ChatService {

    /** 대화 열 때 처음 내려주는 메시지 수. 나머지는 위로 스크롤(=beforeId)로 더 가져간다. */
    private static final int RECENT_LIMIT = 100;

    /** lastReadAt 이 null(한 번도 안 연 방)일 때 쓰는 하한. JPQL 에 null 타임스탬프를 넘기지 않으려는 것. */
    private static final LocalDateTime EPOCH = LocalDateTime.of(1900, 1, 1, 0, 0);

    private final ChatRoomRepository roomRepository;
    private final ChatRoomMemberRepository memberRepository;
    private final ChatMessageRepository messageRepository;
    private final UserService userService;

    // ---------------------------------------------------------------- 방 목록

    /** 내가 참여 중인 방 목록. 마지막 대화가 최근인 순. */
    @Transactional(readOnly = true)
    public List<ChatRoomResponse> rooms(String username) {
        User me = userService.getByUsername(username);
        List<ChatRoom> rooms = roomRepository.findMine(me.getId());
        if (rooms.isEmpty()) {
            return List.of();
        }
        List<Long> ids = rooms.stream().map(ChatRoom::getId).toList();

        Map<Long, List<ChatRoomMember>> membersByRoom = memberRepository.findByRooms(ids).stream()
                .collect(Collectors.groupingBy(m -> m.getRoom().getId()));
        Map<Long, ChatMessage> lastByRoom = messageRepository.findLatestOfRooms(ids).stream()
                .collect(Collectors.toMap(m -> m.getRoom().getId(), Function.identity(), (a, b) -> a));

        return rooms.stream()
                .map(r -> toResponse(r, me, membersByRoom.getOrDefault(r.getId(), List.of()), lastByRoom.get(r.getId())))
                .toList();
    }

    /** 앱바 배지 — 모든 방의 안 읽은 메시지 합계. */
    @Transactional(readOnly = true)
    public long unreadCount(String username) {
        User me = userService.getByUsername(username);
        return roomRepository.findMine(me.getId()).stream()
                .mapToLong(r -> unread(r.getId(), me.getId()))
                .sum();
    }

    // ---------------------------------------------------------------- 방 만들기

    /**
     * 1:1 대화 열기. 같은 두 사람의 방이 이미 있으면 그것을 돌려준다.
     * 동시에 서로 말을 걸어 두 방이 생기는 경우는 {@code direct_key} UNIQUE 가 막고, 여기서 재조회한다.
     */
    @Transactional
    public ChatRoomResponse openDirect(Long otherUserId, String username) {
        User me = userService.getByUsername(username);
        if (otherUserId.equals(me.getId())) {
            throw ApiException.badRequest("자기 자신과는 대화할 수 없습니다.");
        }
        User other = userService.get(otherUserId);
        String key = ChatRoom.directKeyOf(me.getId(), other.getId());

        Optional<ChatRoom> existing = roomRepository.findByDirectKey(key);
        if (existing.isPresent()) {
            return detail(existing.get(), me);
        }

        ChatRoom room = ChatRoom.builder()
                .direct(true)
                .directKey(key)
                .createdBy(me)
                .build();
        try {
            room = roomRepository.saveAndFlush(room);
        } catch (DataIntegrityViolationException e) {
            // 동시 생성 — 먼저 만든 방을 쓴다.
            return detail(roomRepository.findByDirectKey(key)
                    .orElseThrow(() -> ApiException.badRequest("대화방을 열지 못했습니다. 다시 시도하세요.")), me);
        }
        join(room, me);
        join(room, other);
        return detail(room, me);
    }

    /** 그룹 대화방 만들기. 만든 사람은 자동 참여. */
    @Transactional
    public ChatRoomResponse createGroup(String name, List<Long> memberIds, String username) {
        User me = userService.getByUsername(username);
        ChatRoom room = roomRepository.save(ChatRoom.builder()
                .name(name.trim())
                .direct(false)
                .createdBy(me)
                .build());

        join(room, me);
        for (Long id : new LinkedHashSet<>(memberIds)) {
            if (!id.equals(me.getId())) {
                join(room, userService.get(id));
            }
        }
        system(room, "%s 님이 대화방을 만들었습니다.".formatted(me.getName()));
        return detail(room, me);
    }

    /** 그룹방에 초대. 참여자만 초대할 수 있다. */
    @Transactional
    public ChatRoomResponse invite(Long roomId, List<Long> memberIds, String username) {
        User me = userService.getByUsername(username);
        ChatRoom room = mine(roomId, me).getRoom();
        if (room.isDirect()) {
            throw ApiException.badRequest("1:1 대화방에는 초대할 수 없습니다. 그룹 대화방을 만드세요.");
        }
        List<String> added = new ArrayList<>();
        for (Long id : new LinkedHashSet<>(memberIds)) {
            if (memberRepository.findByRoomIdAndUserId(roomId, id).isEmpty()) {
                User u = userService.get(id);
                join(room, u);
                added.add(u.getName());
            }
        }
        if (!added.isEmpty()) {
            system(room, "%s 님이 %s 님을 초대했습니다.".formatted(me.getName(), String.join(", ", added)));
        }
        return detail(room, me);
    }

    /** 그룹방 이름 변경. */
    @Transactional
    public ChatRoomResponse rename(Long roomId, String name, String username) {
        User me = userService.getByUsername(username);
        ChatRoom room = mine(roomId, me).getRoom();
        if (room.isDirect()) {
            throw ApiException.badRequest("1:1 대화방은 이름을 바꿀 수 없습니다.");
        }
        room.setName(name.trim());
        system(room, "%s 님이 대화방 이름을 '%s' 로 바꿨습니다.".formatted(me.getName(), room.getName()));
        return detail(room, me);
    }

    /**
     * 나가기. 마지막 사람이 나가면 방과 메시지를 지운다(아무도 못 여는 방을 남길 이유가 없다).
     * 1:1 방도 나갈 수 있고, 나중에 다시 말을 걸면 같은 키로 방이 새로 열린다.
     */
    @Transactional
    public void leave(Long roomId, String username) {
        User me = userService.getByUsername(username);
        ChatRoomMember member = mine(roomId, me);
        ChatRoom room = member.getRoom();
        memberRepository.delete(member);
        memberRepository.flush();

        if (memberRepository.countByRoomId(roomId) == 0) {
            messageRepository.deleteByRoomId(roomId);
            roomRepository.delete(room);
        } else {
            system(room, "%s 님이 나갔습니다.".formatted(me.getName()));
        }
    }

    // ---------------------------------------------------------------- 메시지

    /**
     * 대화 내용. {@code afterId} 가 있으면 그 이후만(폴링), 없으면 최근 {@value #RECENT_LIMIT} 건.
     * 조회만으로는 읽음 처리하지 않는다 — 읽음은 화면이 명시적으로 {@link #markRead} 를 부른다.
     */
    @Transactional(readOnly = true)
    public List<ChatMessageResponse> messages(Long roomId, Long afterId, String username) {
        User me = userService.getByUsername(username);
        mine(roomId, me);

        List<ChatMessage> list = afterId != null
                ? messageRepository.findAfter(roomId, afterId)
                // findRecent 는 최신순이라 화면에 그리기 전에 시간순으로 되돌린다.
                : messageRepository.findRecent(roomId, PageRequest.of(0, RECENT_LIMIT)).stream()
                        .sorted(Comparator.comparing(ChatMessage::getId)).toList();

        return list.stream().map(ChatMessageResponse::from).toList();
    }

    /** 메시지 보내기. 보낸 사람은 그 시점까지 읽은 것으로 본다. */
    @Transactional
    public ChatMessageResponse send(Long roomId, String content, String username) {
        User me = userService.getByUsername(username);
        ChatRoomMember member = mine(roomId, me);
        ChatRoom room = member.getRoom();

        LocalDateTime now = LocalDateTime.now();
        ChatMessage m = messageRepository.save(ChatMessage.builder()
                .room(room)
                .sender(me)
                .content(content)
                .sentAt(now)
                .build());
        room.setLastMessageAt(now);
        member.setLastReadAt(now);
        return ChatMessageResponse.from(m);
    }

    /** 여기까지 읽음. */
    @Transactional
    public ChatRoomResponse markRead(Long roomId, String username) {
        User me = userService.getByUsername(username);
        ChatRoomMember member = mine(roomId, me);
        member.setLastReadAt(LocalDateTime.now());
        return detail(member.getRoom(), me);
    }

    // ---------------------------------------------------------------- 내부

    private void join(ChatRoom room, User user) {
        memberRepository.save(ChatRoomMember.builder()
                .room(room)
                .user(user)
                .joinedAt(LocalDateTime.now())
                .build());
    }

    /** 시스템 안내 메시지. 방 정렬 시각도 같이 올린다. */
    private void system(ChatRoom room, String content) {
        LocalDateTime now = LocalDateTime.now();
        messageRepository.save(ChatMessage.builder()
                .room(room)
                .content(content)
                .sentAt(now)
                .build());
        room.setLastMessageAt(now);
    }

    /**
     * 내가 참여한 방인지 확인. 아니면 남의 대화를 읽는 것이므로 막는다.
     *
     * <p>없는 방 번호도 여기서 똑같이 403 이 된다. 일부러 그렇다 — 404 로 갈라 주면
     * 번호를 하나씩 올려 가며 <b>어느 방이 있는지</b>를 알아낼 수 있다. 방이 있는지 없는지는
     * 그 방 사람만 알 일이다.
     */
    private ChatRoomMember mine(Long roomId, User me) {
        return memberRepository.findByRoomIdAndUserId(roomId, me.getId())
                .orElseThrow(() -> ApiException.forbidden("참여 중인 대화방이 아닙니다."));
    }

    private long unread(Long roomId, Long userId) {
        LocalDateTime since = memberRepository.findByRoomIdAndUserId(roomId, userId)
                .map(m -> m.getLastReadAt() == null ? EPOCH : m.getLastReadAt())
                .orElse(EPOCH);
        return messageRepository.countUnread(roomId, userId, since);
    }

    private ChatRoomResponse detail(ChatRoom room, User me) {
        List<ChatRoomMember> members = memberRepository.findByRoom(room.getId());
        List<ChatMessage> last = messageRepository.findRecent(room.getId(), PageRequest.of(0, 1));
        return toResponse(room, me, members, last.isEmpty() ? null : last.get(0));
    }

    private ChatRoomResponse toResponse(ChatRoom room, User me, List<ChatRoomMember> members, ChatMessage last) {
        List<ChatMemberResponse> memberDtos = members.stream()
                .map(m -> new ChatMemberResponse(m.getUser().getId(), m.getUser().getName(), m.getUser().getDepartment()))
                .toList();

        return new ChatRoomResponse(
                room.getId(),
                title(room, me, memberDtos),
                room.isDirect(),
                memberDtos.size(),
                memberDtos,
                last != null ? last.getContent() : null,
                last != null ? (last.getSender() != null ? last.getSender().getName() : "안내") : null,
                room.getLastMessageAt(),
                unread(room.getId(), me.getId()));
    }

    /** 1:1 은 상대 이름, 그룹은 방 이름(비어 있으면 참여자 이름을 이어 붙인다). */
    private String title(ChatRoom room, User me, List<ChatMemberResponse> members) {
        if (room.isDirect()) {
            return members.stream()
                    .filter(m -> !m.userId().equals(me.getId()))
                    .map(ChatMemberResponse::name)
                    .findFirst()
                    .orElse("(나간 사용자)");
        }
        if (room.getName() != null && !room.getName().isBlank()) {
            return room.getName();
        }
        return members.stream().map(ChatMemberResponse::name).collect(Collectors.joining(", "));
    }
}
