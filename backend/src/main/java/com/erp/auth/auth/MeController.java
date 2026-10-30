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

/**
 * 현재 로그인 사용자의 인가 정보. 프론트가 메뉴 노출·라우트 가드에 쓴다.
 * ADMIN 이면 {@code admin=true} 이고 개별 코드와 무관하게 전권이다.
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final UserInputMemoryService memoryService;
    private final WorkPermissionService workPermissionService;

    public MeController(UserInputMemoryService memoryService, WorkPermissionService workPermissionService) {
        this.memoryService = memoryService;
        this.workPermissionService = workPermissionService;
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
