package com.erp.auth.permissionrequest;

import com.erp.auth.permissionrequest.dto.PermissionRequestDtos.CreatePermissionRequest;
import com.erp.auth.permissionrequest.dto.PermissionRequestDtos.PermissionRequestResponse;
import com.erp.auth.role.Role;
import com.erp.auth.user.BasePermission;
import com.erp.auth.user.User;
import com.erp.auth.user.UserService;
import com.erp.auth.workpermission.WorkPermissionService;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.SaveWorkRow;
import com.erp.common.ApiException;
import com.erp.common.MenuPermissionCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

/**
 * 권한요청(요청 쪽) · 권한승인대기현황(승인 쪽). 원본 영상 1998 · 2000 · 1514.
 *
 * <p>요청은 누구나(권한이 없어서 하는 것이다) — {@code /api/permission-requests} 는 카탈로그에 매핑하지 않았다.
 * 목록 · 승인 · 반려는 마스터만(여기서 본다).
 */
@Service
@RequiredArgsConstructor
public class PermissionRequestService {

    private final PermissionRequestRepository repository;
    private final UserService userService;
    private final WorkPermissionService workPermissionService;
    private final ApplicationEventPublisher events;

    /**
     * [권한요청]. 같은 사람 · 같은 업무의 대기 요청이 이미 있으면 새로 쌓지 않고 그 줄의 사유 · 화면 · 시각만 새로 쓴다
     * (알림도 다시 보내지 않는다 — 누를 때마다 마스터 메신저가 쌓이지 않게).
     */
    @Transactional
    public PermissionRequestResponse create(CreatePermissionRequest req, Long requesterId) {
        String code = req.workCode();
        if (!MenuPermissionCatalog.exists(code)) throw ApiException.badRequest("없는 업무입니다: " + code);
        if (MenuPermissionCatalog.MASTER_ONLY.contains(code)) {
            throw ApiException.badRequest("마스터만 쓰는 메뉴는 권한을 요청할 수 없습니다.");
        }
        User requester = userService.get(requesterId);
        if (requester.isMaster()) throw ApiException.badRequest("마스터는 모든 권한이 있습니다.");
        String reason = StringUtils.hasText(req.reason()) ? req.reason().trim() : null;

        var pending = repository.findByRequester_IdAndWorkCodeAndStatus(requesterId, code, PermissionRequestStatus.PENDING);
        if (pending.isPresent()) {
            PermissionRequest r = pending.get();
            if (reason != null) r.setReason(reason);
            r.setMenuPath(req.menuPath());
            r.setMenuName(req.menuName());
            r.setRequestedAt(LocalDateTime.now());
            return toResponse(r);
        }
        PermissionRequest r = repository.save(PermissionRequest.builder()
                .requester(requester).workCode(code).menuPath(req.menuPath()).menuName(req.menuName())
                .reason(reason).status(PermissionRequestStatus.PENDING).requestedAt(LocalDateTime.now()).build());
        List<Long> masters = workPermissionService.masterUsers().stream().map(User::getId).toList();
        events.publishEvent(new PermissionRequestEvents.Requested(r.getId(), requesterId, masters,
                MenuPermissionCatalog.nameOf(code), req.menuName(), reason));
        return toResponse(r);
    }

    /** 권한승인대기현황 — 기준일자(요청일 from~to) · 사용자 ID(아이디 · 이름 부분일치) · 승인여부. */
    @Transactional(readOnly = true)
    public List<PermissionRequestResponse> list(LocalDate from, LocalDate to, String user, PermissionRequestStatus status,
                                                boolean master) {
        requireMaster(master);
        String q = StringUtils.hasText(user) ? user.trim().toLowerCase() : null;
        return repository.findAllWithRefs().stream()
                .filter(r -> from == null || !r.getRequestedAt().toLocalDate().isBefore(from))
                .filter(r -> to == null || !r.getRequestedAt().toLocalDate().isAfter(to))
                .filter(r -> status == null || r.getStatus() == status)
                .filter(r -> q == null || r.getRequester().getUsername().toLowerCase().contains(q)
                        || r.getRequester().getName().toLowerCase().contains(q))
                .map(this::toResponse)
                .toList();
    }

    /**
     * 원본 알림 · 메신저 글 — '박은우/박은우 님이 판매입력 접근 권한을 요청합니다.'(영상 1998 · 2000 화면, 이름/아이디 순서는 추정).
     * 메뉴 이름이 없으면 업무 이름.
     */
    public static String requestText(String name, String username, String menuName, String workName) {
        return name + "/" + username + " 님이 " + (StringUtils.hasText(menuName) ? menuName : workName) + " 접근 권한을 요청합니다.";
    }

    /** 가장 최근 대기 요청의 알림 글(마스터 오른쪽 아래 알림창). 없으면 null. */
    @Transactional(readOnly = true)
    public String latestPendingText() {
        return repository.findAllWithRefs().stream()
                .filter(r -> r.getStatus() == PermissionRequestStatus.PENDING)
                .max(Comparator.comparing(PermissionRequest::getRequestedAt))
                .map(r -> requestText(r.getRequester().getName(), r.getRequester().getUsername(), r.getMenuName(),
                        MenuPermissionCatalog.nameOf(r.getWorkCode())))
                .orElse(null);
    }

    /** 대기 건수 — 마스터 알림(앱바 알림 · 오른쪽 아래 알림창). */
    @Transactional(readOnly = true)
    public long countPending() {
        return repository.countByStatus(PermissionRequestStatus.PENDING);
    }

    /**
     * [승인] — 개별권한(USER) 이면 요청자의 그 업무를, 권한그룹(GROUP) 이면 요청자 권한그룹의 그 업무를 받은 값으로 바꾸고 승인한다.
     * 한 트랜잭션이라 권한 저장과 승인 표시가 갈라지지 않는다.
     */
    @Transactional
    public PermissionRequestResponse approve(Long id, ApproveKind kind, SaveWorkRow row, Long actorId, boolean master) {
        requireMaster(master);
        PermissionRequest r = pending(id);
        if (!r.getWorkCode().equals(row.workCode())) throw ApiException.badRequest("요청한 업무와 다른 업무입니다.");
        if (kind == ApproveKind.GROUP) {
            Role group = groupOf(r.getRequester());
            // 기본권한이 권한그룹이 아니면(업무모든권한 · 업무권한없음) 그룹을 바꿔도 요청자에게 닿지 않는다.
            if (group == null || r.getRequester().getBasePermission() != BasePermission.GROUP) {
                throw ApiException.badRequest("요청한 사용자의 기본권한이 권한그룹이 아닙니다. 개별권한으로 승인하세요.");
            }
            workPermissionService.saveGroupWork(group.getId(), row);
            // 그 업무를 개별로 막아 둔 줄이 있으면 그룹보다 이기므로 지워 그룹을 따르게 한다(승인했는데 안 열리던 것).
            workPermissionService.clearUserWork(r.getRequester().getId(), r.getWorkCode());
        } else {
            workPermissionService.saveUserWork(r.getRequester().getId(), row);
        }
        return process(r, PermissionRequestStatus.APPROVED, kind, actorId);
    }

    @Transactional
    public PermissionRequestResponse reject(Long id, Long actorId, boolean master) {
        requireMaster(master);
        return process(pending(id), PermissionRequestStatus.REJECTED, null, actorId);
    }

    /** 요청 지우기(마스터) — 시험 자료 정리 · 잘못 쌓인 요청. */
    @Transactional
    public void delete(Long id, boolean master) {
        requireMaster(master);
        repository.delete(repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("권한요청을 찾을 수 없습니다. id=" + id)));
    }

    private PermissionRequestResponse process(PermissionRequest r, PermissionRequestStatus status, ApproveKind kind,
                                              Long actorId) {
        User actor = userService.get(actorId);
        r.setStatus(status);
        r.setApproveKind(kind);
        r.setProcessedBy(actor);
        r.setProcessedAt(LocalDateTime.now());
        events.publishEvent(new PermissionRequestEvents.Processed(r.getId(), r.getRequester().getId(), actorId,
                MenuPermissionCatalog.nameOf(r.getWorkCode()), r.getMenuName(), status == PermissionRequestStatus.APPROVED));
        return toResponse(r);
    }

    private PermissionRequest pending(Long id) {
        PermissionRequest r = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("권한요청을 찾을 수 없습니다. id=" + id));
        if (r.getStatus() != PermissionRequestStatus.PENDING) {
            throw ApiException.conflict("이미 처리한 요청입니다.");
        }
        return r;
    }

    private static void requireMaster(boolean master) {
        if (!master) {
            throw ApiException.forbidden("권한이 없습니다.\n마스터에게 문의 바랍니다.\n- 권한승인대기현황 업무권한 (조회)");
        }
    }

    private static Role groupOf(User u) {
        return u.getRoles().stream().filter(x -> !User.MASTER_ROLE.equals(x.getName()))
                .min(Comparator.comparing(Role::getId)).orElse(null);
    }

    private PermissionRequestResponse toResponse(PermissionRequest r) {
        // 권한그룹 승인은 기본권한이 권한그룹인 사람만(그 외엔 화면이 [권한그룹] 을 막는다)
        Role g = r.getRequester().getBasePermission() == BasePermission.GROUP ? groupOf(r.getRequester()) : null;
        return PermissionRequestResponse.from(r, g == null ? null : g.getId(), g == null ? null : g.getDisplayName());
    }
}
