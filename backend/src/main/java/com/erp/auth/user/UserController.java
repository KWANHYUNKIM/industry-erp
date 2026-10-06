package com.erp.auth.user;

import com.erp.auth.user.dto.UserDtos.CreateUserRequest;
import com.erp.auth.user.dto.UserDtos.UpdateUserRequest;
import com.erp.auth.user.dto.UserDtos.UserResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.auth.user.dto.UserDtos;

/**
 * 사용자 관리 API. 관리자(ADMIN)만 접근 가능.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public List<UserResponse> list() {
        return userService.findAll();
    }

    @GetMapping("/{id}")
    public UserResponse get(@PathVariable Long id) {
        return userService.findById(id);
    }

    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.ok(userService.create(request));
    }

    @PutMapping("/{id}")
    public UserResponse update(@PathVariable Long id, @Valid @RequestBody UpdateUserRequest request) {
        return userService.update(id, request);
    }

    /** 사용여부만 바꾼다 — 목록의 토글이 쓴다. */
    @PatchMapping("/{id}")
    public UserResponse setEnabled(@PathVariable Long id,
                                   @Valid @RequestBody UserDtos.ToggleEnabledRequest request) {
        return userService.setEnabled(id, request.enabled());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
