package com.erp.auth.auth;

import com.erp.auth.memory.UserInputMemoryService;
import com.erp.auth.memory.dto.UserInputMemoryDtos.MemoryResponse;
import com.erp.auth.memory.dto.UserInputMemoryDtos.SaveMemoryRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 현재 로그인 사용자의 인가 정보. 프론트가 메뉴 노출·라우트 가드에 쓴다.
 * ADMIN 이면 {@code admin=true} 이고 개별 코드와 무관하게 전권이다.
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final UserInputMemoryService memoryService;

    public MeController(UserInputMemoryService memoryService) {
        this.memoryService = memoryService;
    }

    /** 마지막에 쓴 값 기억(예: 판매입력 머리). 계정마다 서버에 남아 다른 PC 에서도 이어진다. */
    @GetMapping("/memory/{key}")
    public MemoryResponse getMemory(@AuthenticationPrincipal UserPrincipal principal, @PathVariable String key) {
        return new MemoryResponse(memoryService.get(principal.getId(), key));
    }

    @PutMapping("/memory/{key}")
    public MemoryResponse putMemory(@AuthenticationPrincipal UserPrincipal principal, @PathVariable String key,
                                    @Valid @RequestBody SaveMemoryRequest req) {
        memoryService.put(principal.getId(), key, req.value());
        return new MemoryResponse(req.value());
    }

    public record MyPermissions(boolean admin, List<String> codes) {}

    @GetMapping("/permissions")
    public MyPermissions permissions(@AuthenticationPrincipal UserPrincipal principal) {
        return new MyPermissions(
                principal.isAdmin(),
                principal.getPermissionCodes().stream().sorted().toList());
    }
}
