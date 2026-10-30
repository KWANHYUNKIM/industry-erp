package com.erp.groupware.schedule;

import com.erp.common.ApiException;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.CreateScheduleEventRequest;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.ScheduleEventResponse;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.UpdateScheduleEventRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.groupware.schedule.dto.ScheduleEventDtos;

@Service
@RequiredArgsConstructor
public class ScheduleEventService {

    private final com.erp.inventory.project.ProjectService projectService;
    /** [H] 이력의 대상 이름(이미 적힌 줄과 같은 글자) */
    public static final String SCHEDULE_HISTORY = "SCHEDULE";
    private final ScheduleEventRepository scheduleEventRepository;
    private final ScheduleLabelRepository labelRepository;
    private final com.erp.common.history.ChangeHistoryService workHistoryService;

    /** 일자 오름차순, 그다음 시간/ID 순. */
    @Transactional(readOnly = true)
    public List<ScheduleEventResponse> findAll() {
        return findAll(null);
    }

    /**
     * 보는 사람이 볼 수 있는 일정만(원본 [권한] 게시글권한 · [캘린더]). viewer 가 null 이면 전부(내부 호출).
     */
    @Transactional(readOnly = true)
    public List<ScheduleEventResponse> findAll(Viewer viewer) {
        java.util.Map<String, ScheduleLabel> labels = labels();
        return scheduleEventRepository.findAll(
                        Sort.by(Sort.Order.asc("eventDate"), Sort.Order.asc("startTime"), Sort.Order.asc("id"))).stream()
                .filter(e -> viewer == null || canView(e, viewer))
                .map(e -> ScheduleEventResponse.from(e, labels))
                .toList();
    }

    /** 일정을 보는 사람 — 로그인 ID · 이름(참석자 · 공유자 칸은 이름으로 적힌다) · 관리자 여부. */
    public record Viewer(String username, String name, boolean admin) {}

    private static boolean listed(String names, Viewer v) {
        if (names == null || names.isBlank()) return false;
        for (String n : names.split(",")) {
            String t = n.trim();
            if (t.isEmpty()) continue;
            if (t.equals(v.name()) || t.equals(v.username())) return true;
        }
        return false;
    }

    private static boolean isCreator(ScheduleEvent e, Viewer v) {
        return e.getCreatedBy() != null && e.getCreatedBy().equals(v.username());
    }

    private static boolean isSharer(ScheduleEvent e, Viewer v) {
        return "전체".equals(e.getSharers() != null ? e.getSharers().trim() : null) || listed(e.getSharers(), v);
    }

    /**
     * 원본 [캘린더] · [권한] 게시글권한(2026-10-13 실측 표: 참석자 · 공유자는 조회가 늘 켜져 있고, 이외사용자 조회는 기본 끔).
     * 개인일정캘린더(shared=false)는 만든 사람만 본다. 만든 사람이 없는 옛 일정은 그대로 모두가 본다.
     */
    static boolean canView(ScheduleEvent e, Viewer v) {
        if (isCreator(e, v)) return true;
        if (!e.isShared()) return false;
        if (e.getCreatedBy() == null || v.admin()) return true;
        return listed(e.getAttendees(), v) || isSharer(e, v) || e.isPermOthersView();
    }

    /** 원본 게시글권한의 [수정/삭제] — 만든 사람, 켜져 있으면 참석자 · 공유자. */
    static boolean canEdit(ScheduleEvent e, Viewer v) {
        if (isCreator(e, v) || e.getCreatedBy() == null) return true;
        if (!e.isShared()) return false;
        if (v.admin()) return true;
        return (e.isPermAttendeeEdit() && listed(e.getAttendees(), v)) || (e.isPermSharerEdit() && isSharer(e, v));
    }

    private void checkEdit(ScheduleEvent e, Viewer v) {
        if (v != null && !canEdit(e, v)) throw ApiException.forbidden("이 일정을 수정/삭제할 권한이 없습니다.");
    }

    /**
     * 원본 [반복설정] 이 있으면 날마다 한 줄씩 펼쳐 넣고 같은 repeat_group 으로 묶는다(첫 줄을 돌려준다).
     * 시간 · 제목 · 참석자 … 는 모든 줄이 같다.
     */
    @Transactional
    public ScheduleEventResponse create(CreateScheduleEventRequest req, String username) {
        List<java.time.LocalDate> dates = req.repeat() == null ? List.of(req.eventDate()) : ScheduleRepeat.dates(req.repeat());
        if (dates.isEmpty()) throw ApiException.badRequest("반복설정으로 만들어지는 일정이 없습니다.");
        String group = req.repeat() == null ? null : java.util.UUID.randomUUID().toString();
        String rule = req.repeat() == null ? null : req.repeat().summary();
        com.erp.inventory.project.Project project = projectOf(req.projectId());
        ScheduleEvent first = null;
        for (java.time.LocalDate d : dates) {
            ScheduleEvent e = ScheduleEvent.builder()
                    .eventDate(d)
                    .startTime(req.startTime())
                    .endTime(req.endTime())
                    .title(req.title())
                    .category(req.category())
                    .owner(req.owner())
                    .location(req.location())
                    .attendees(req.attendees())
                    .labelCode(blankToNull(req.labelCode()))
                    .remark(req.remark())
                    /* 안 주면 공유다 — 예전 일정이 다 그랬고, 갑자기 안 보이는 것이 더 놀랍다. */
                    .shared(req.shared() == null || req.shared())
                    .project(project)
                    .sharers(req.sharers())
                    .permAttendeeEdit(req.permAttendeeEdit() == null || req.permAttendeeEdit())
                    .permSharerEdit(req.permSharerEdit() == null || req.permSharerEdit())
                    .permOthersView(req.permOthersView() != null && req.permOthersView())
                    .repeatGroup(group)
                    .repeatRule(rule)
                    .createdBy(username)
                    .build();
            ScheduleEvent saved = scheduleEventRepository.save(e);
            workHistoryService.record(SCHEDULE_HISTORY, saved.getId(),
                    com.erp.common.history.ChangeHistoryService.CREATED);
            if (first == null) first = saved;
        }
        return ScheduleEventResponse.from(first, labels());
    }

    /**
     * 반복 일정이면 scope(원본 '반복일정삭제' 창의 이번 일정만 · 향후 모든 일정 · 전체 반복일정)만큼 같이 고친다.
     * 여러 줄을 고칠 때 일자는 각자 그대로 둔다 — 고른 줄의 일자만 바뀐다.
     */
    @Transactional
    public ScheduleEventResponse update(Long id, UpdateScheduleEventRequest req) {
        return update(id, req, null);
    }

    @Transactional
    public ScheduleEventResponse update(Long id, UpdateScheduleEventRequest req, Viewer viewer) {
        ScheduleEvent target = get(id);
        checkEdit(target, viewer);
        for (ScheduleEvent e : scopeOf(target, req.scope())) {
            if (req.eventDate() != null && e == target) e.setEventDate(req.eventDate());
            if (req.startTime() != null) e.setStartTime(req.startTime());
            if (req.endTime() != null) e.setEndTime(req.endTime());
            if (req.title() != null) e.setTitle(req.title());
            if (req.category() != null) e.setCategory(req.category());
            if (req.owner() != null) e.setOwner(req.owner());
            if (req.location() != null) e.setLocation(req.location());
            if (req.attendees() != null) e.setAttendees(req.attendees());
            if (req.labelCode() != null) e.setLabelCode(blankToNull(req.labelCode()));
            if (req.remark() != null) e.setRemark(req.remark());
            if (req.shared() != null) e.setShared(req.shared());
            if (req.projectId() != null) e.setProject(projectOf(req.projectId()));
            if (req.sharers() != null) e.setSharers(req.sharers());
            if (req.permAttendeeEdit() != null) e.setPermAttendeeEdit(req.permAttendeeEdit());
            if (req.permSharerEdit() != null) e.setPermSharerEdit(req.permSharerEdit());
            if (req.permOthersView() != null) e.setPermOthersView(req.permOthersView());
            workHistoryService.record(SCHEDULE_HISTORY, e.getId(),
                    com.erp.common.history.ChangeHistoryService.UPDATED);
        }
        return ScheduleEventResponse.from(target, labels());
    }

    /** 원본 '일정조회' [H] '이력' — 저장할 때마다 한 줄(신규 · 수정). */
    @Transactional(readOnly = true)
    public List<com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse> history(Long id) {
        ScheduleEvent e = get(id);
        return workHistoryService.list(SCHEDULE_HISTORY, id, e.getCreatedBy(), e.getCreatedAt());
    }

    /** 원본 '반복일정삭제' — ONE(이번 일정만, 기본) · FOLLOWING(향후 모든 일정) · ALL(전체 반복일정). */
    @Transactional
    public void delete(Long id, String scope) {
        delete(id, scope, null);
    }

    @Transactional
    public void delete(Long id, String scope, Viewer viewer) {
        ScheduleEvent target = get(id);
        checkEdit(target, viewer);
        scheduleEventRepository.deleteAll(scopeOf(target, scope));
    }

    private List<ScheduleEvent> scopeOf(ScheduleEvent target, String scope) {
        if (target.getRepeatGroup() == null || scope == null || "ONE".equals(scope)) return List.of(target);
        List<ScheduleEvent> group = scheduleEventRepository.findByRepeatGroup(target.getRepeatGroup());
        if ("ALL".equals(scope)) return group;
        if ("FOLLOWING".equals(scope)) {
            return group.stream().filter(e -> !e.getEventDate().isBefore(target.getEventDate())).toList();
        }
        throw ApiException.badRequest("반복일정 범위가 올바르지 않습니다: " + scope);
    }

    /** 라벨코드 → 라벨(이름 · 색). 일정에는 코드만 있다. */
    private java.util.Map<String, ScheduleLabel> labels() {
        java.util.Map<String, ScheduleLabel> m = new java.util.HashMap<>();
        for (ScheduleLabel l : labelRepository.findAll()) m.put(l.getCode(), l);
        return m;
    }

    /** 빈 라벨코드는 '라벨 없음'. 고른 코드는 마스터에 있어야 한다. */
    private String blankToNull(String code) {
        if (code == null || code.isBlank()) return null;
        String c = code.trim();
        if (!labelRepository.existsByCode(c)) throw ApiException.badRequest("라벨을 찾을 수 없습니다: " + c);
        return c;
    }

    private ScheduleEvent get(Long id) {
        return scheduleEventRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("일정을 찾을 수 없습니다. id=" + id));
    }

    /** 원본 [프로젝트]. 안 고르면 안 붙인다. 없는 id 를 조용히 흘리지 않는다. */
    private com.erp.inventory.project.Project projectOf(Long id) {
        if (id == null) return null;
        return projectService.get(id);
    }

}
