package com.erp.auth.auth;

import com.erp.auth.memory.UserInputMemoryService;
import com.erp.auth.memory.dto.UserInputMemoryDtos.MemoryResponse;
import com.erp.auth.memory.dto.UserInputMemoryDtos.SaveMemoryRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.erp.auth.workpermission.WorkPermissionService;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.MasterResponse;
import com.erp.common.MenuPermissionCatalog;
import com.erp.auth.auth.dto.AuthDtos.MyPasswordRequest;
import com.erp.auth.auth.dto.AuthDtos.TokenResponse;
import com.erp.security.JwtTokenProvider;
import com.erp.tenant.TenantContext;
import com.erp.auth.auth.dto.AuthDtos.MyProfileRequest;
import com.erp.auth.auth.dto.AuthDtos.MyProfileResponse;
import com.erp.auth.user.UserService;
import com.erp.auth.user.User;

/**
 * 현재 로그인 사용자의 인가 정보. 프론트가 메뉴 노출·라우트 가드에 쓴다.
 * ADMIN 이면 {@code admin=true} 이고 개별 코드와 무관하게 전권이다.
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final UserInputMemoryService memoryService;
    private final WorkPermissionService workPermissionService;
    private final UserService userService;
    private final JwtTokenProvider tokenProvider;

    public MeController(UserInputMemoryService memoryService, WorkPermissionService workPermissionService,
                        UserService userService, JwtTokenProvider tokenProvider) {
        this.memoryService = memoryService;
        this.workPermissionService = workPermissionService;
        this.userService = userService;
        this.tokenProvider = tokenProvider;
    }

    /** 사람 그림 › [개인정보수정] 창 — 본인 것만 읽고 고친다(사용자등록 권한이 없어도 된다). */
    @GetMapping("/profile")
    public MyProfileResponse profile(@AuthenticationPrincipal UserPrincipal principal) {
        User u = userService.getByUsername(principal.getUsername());
        return new MyProfileResponse(u.getUsername(), u.getName(), u.getEmail());
    }

    @PutMapping("/profile")
    public MyProfileResponse updateProfile(@AuthenticationPrincipal UserPrincipal principal, @Valid @RequestBody MyProfileRequest req) {
        var r = userService.updateOwnProfile(principal.getUsername(), req.name(), req.email());
        return new MyProfileResponse(r.username(), r.name(), r.email());
    }

    /** 비밀번호를 바꾸면 다른 기기의 토큰은 끊긴다(H6). 지금 창이 이어 쓰도록 새 토큰을 돌려준다. */
    @PutMapping("/password")
    public TokenResponse changePassword(@AuthenticationPrincipal UserPrincipal principal, @Valid @RequestBody MyPasswordRequest req) {
        int tv = userService.changeOwnPassword(principal.getUsername(), req.currentPassword(), req.newPassword());
        return new TokenResponse(tokenProvider.createToken(principal.getUsername(), TenantContext.get(), tv));
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

    /**
     * 내 업무권한. admin = 마스터. codes = 들어갈 수 있는 업무. works = 업무별 풀린 권한(예외(행위) · 예외(메뉴) 포함) —
     * 화면이 자물쇠 화면 · 행위 버튼을 정한다(막는 것은 서버 인터셉터가 한다).
     */
    public record WorkAccess(String mode, boolean create, boolean update, boolean delete, boolean export,
                             Map<String, Boolean> menus) {}

    public record MyPermissions(boolean admin, List<String> codes, Map<String, WorkAccess> works,
                                Map<String, String> workNames, List<String> masterOnly) {}

    @GetMapping("/permissions")
    public MyPermissions permissions(@AuthenticationPrincipal UserPrincipal principal) {
        Map<String, WorkAccess> works = new LinkedHashMap<>();
        principal.getPermissions().works().forEach((code, a) -> works.put(code,
                new WorkAccess(a.mode().name(), a.create(), a.update(), a.delete(), a.export(), a.menus())));
        Map<String, String> names = new LinkedHashMap<>();
        MenuPermissionCatalog.ALL.forEach(p -> names.put(p.code(), p.name()));
        return new MyPermissions(
                principal.isAdmin(),
                principal.getPermissionCodes().stream().sorted().toList(),
                works, names, MenuPermissionCatalog.MASTER_ONLY.stream().sorted().toList());
    }

    /** 우리회사마스터 — 자물쇠 화면 '우리회사마스터 : a , b , c'. 권한 없는 사람도 읽는다(/api/me 는 인증만). */
    @GetMapping("/masters")
    public List<MasterResponse> masters() {
        return workPermissionService.masters();
    }
}
