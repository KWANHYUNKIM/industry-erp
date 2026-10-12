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
    private final ScheduleEventRepository scheduleEventRepository;

    /** 일자 오름차순, 그다음 시간/ID 순. */
    @Transactional(readOnly = true)
    public List<ScheduleEventResponse> findAll() {
        return scheduleEventRepository.findAll(
                        Sort.by(Sort.Order.asc("eventDate"), Sort.Order.asc("startTime"), Sort.Order.asc("id"))).stream()
                .map(ScheduleEventResponse::from)
                .toList();
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
                    .labelText(req.labelText())
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
            if (first == null) first = saved;
        }
        return ScheduleEventResponse.from(first);
    }

    /**
     * 반복 일정이면 scope(원본 '반복일정삭제' 창의 이번 일정만 · 향후 모든 일정 · 전체 반복일정)만큼 같이 고친다.
     * 여러 줄을 고칠 때 일자는 각자 그대로 둔다 — 고른 줄의 일자만 바뀐다.
     */
    @Transactional
    public ScheduleEventResponse update(Long id, UpdateScheduleEventRequest req) {
        ScheduleEvent target = get(id);
        for (ScheduleEvent e : scopeOf(target, req.scope())) {
            if (req.eventDate() != null && e == target) e.setEventDate(req.eventDate());
            if (req.startTime() != null) e.setStartTime(req.startTime());
            if (req.endTime() != null) e.setEndTime(req.endTime());
            if (req.title() != null) e.setTitle(req.title());
            if (req.category() != null) e.setCategory(req.category());
            if (req.owner() != null) e.setOwner(req.owner());
            if (req.location() != null) e.setLocation(req.location());
            if (req.attendees() != null) e.setAttendees(req.attendees());
            if (req.labelText() != null) e.setLabelText(req.labelText());
            if (req.remark() != null) e.setRemark(req.remark());
            if (req.shared() != null) e.setShared(req.shared());
            if (req.projectId() != null) e.setProject(projectOf(req.projectId()));
            if (req.sharers() != null) e.setSharers(req.sharers());
            if (req.permAttendeeEdit() != null) e.setPermAttendeeEdit(req.permAttendeeEdit());
            if (req.permSharerEdit() != null) e.setPermSharerEdit(req.permSharerEdit());
            if (req.permOthersView() != null) e.setPermOthersView(req.permOthersView());
        }
        return ScheduleEventResponse.from(target);
    }

    /** 원본 '반복일정삭제' — ONE(이번 일정만, 기본) · FOLLOWING(향후 모든 일정) · ALL(전체 반복일정). */
    @Transactional
    public void delete(Long id, String scope) {
        scheduleEventRepository.deleteAll(scopeOf(get(id), scope));
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
