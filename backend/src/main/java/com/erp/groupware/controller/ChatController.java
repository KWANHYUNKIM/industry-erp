package com.erp.groupware.controller;

import com.erp.groupware.dto.ChatDtos.ChatMessageResponse;
import com.erp.groupware.dto.ChatDtos.ChatRoomResponse;
import com.erp.groupware.dto.ChatDtos.ChatUnread;
import com.erp.groupware.dto.ChatDtos.CreateRoomRequest;
import com.erp.groupware.dto.ChatDtos.InviteRequest;
import com.erp.groupware.dto.ChatDtos.OpenDirectRequest;
import com.erp.groupware.dto.ChatDtos.RenameRequest;
import com.erp.groupware.dto.ChatDtos.SendMessageRequest;
import com.erp.groupware.service.ChatService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 사내 메신저(앱바 💬). 대화방과 메시지. */
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService service;

    /** 내가 참여 중인 대화방 목록. */
    @GetMapping("/rooms")
    public List<ChatRoomResponse> rooms(@AuthenticationPrincipal UserPrincipal principal) {
        return service.rooms(principal.getUsername());
    }

    /** 앱바 배지용 미읽음 합계. */
    @GetMapping("/unread-count")
    public ChatUnread unreadCount(@AuthenticationPrincipal UserPrincipal principal) {
        return new ChatUnread(service.unreadCount(principal.getUsername()));
    }

    /** 1:1 대화 열기(있으면 재사용). */
    @PostMapping("/rooms/direct")
    public ChatRoomResponse openDirect(@Valid @RequestBody OpenDirectRequest req,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        return service.openDirect(req.userId(), principal.getUsername());
    }

    /** 그룹 대화방 만들기. */
    @PostMapping("/rooms")
    public ChatRoomResponse createGroup(@Valid @RequestBody CreateRoomRequest req,
                                        @AuthenticationPrincipal UserPrincipal principal) {
        return service.createGroup(req.name(), req.memberIds(), principal.getUsername());
    }

    /** 대화 내용. afterId 를 주면 그 이후 메시지만(증분 폴링). */
    @GetMapping("/rooms/{id}/messages")
    public List<ChatMessageResponse> messages(@PathVariable Long id,
                                              @RequestParam(required = false) Long afterId,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        return service.messages(id, afterId, principal.getUsername());
    }

    @PostMapping("/rooms/{id}/messages")
    public ChatMessageResponse send(@PathVariable Long id,
                                    @Valid @RequestBody SendMessageRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return service.send(id, req.content(), principal.getUsername());
    }

    @PostMapping("/rooms/{id}/read")
    public ChatRoomResponse markRead(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.markRead(id, principal.getUsername());
    }

    @PostMapping("/rooms/{id}/invite")
    public ChatRoomResponse invite(@PathVariable Long id,
                                   @Valid @RequestBody InviteRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.invite(id, req.memberIds(), principal.getUsername());
    }

    @PutMapping("/rooms/{id}/name")
    public ChatRoomResponse rename(@PathVariable Long id,
                                   @Valid @RequestBody RenameRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.rename(id, req.name(), principal.getUsername());
    }

    /** 대화방 나가기. 마지막 사람이 나가면 방이 사라진다. */
    @DeleteMapping("/rooms/{id}/me")
    public ResponseEntity<Void> leave(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        service.leave(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
