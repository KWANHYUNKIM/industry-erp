package com.erp.groupware.supply;

import com.erp.auth.user.User;
import com.erp.auth.user.UserRepository;
import com.erp.common.ApiException;
import com.erp.groupware.schedule.ScheduleRepeat;
import com.erp.groupware.supply.dto.SupplyUsageDtos.ChangeSupplyLabelRequest;
import com.erp.groupware.supply.dto.SupplyUsageDtos.CreateSupplyUsageRequest;
import com.erp.groupware.supply.dto.SupplyUsageDtos.SupplyUsageResponse;
import com.erp.groupware.supply.dto.SupplyUsageDtos.UpdateSupplyUsageRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 공용품 사용내역. 원본 공용품관리(E070204)는 이 기록을 기간으로 조회하는 화면이다.
 */
@Service
@RequiredArgsConstructor
public class SupplyUsageService {

    /** 기간을 안 주면 오늘부터 한 주 — 원본 기본값과 같다. */
    private static final int DEFAULT_DAYS = 6;

    /** [H] 이력의 대상 이름(이미 적힌 줄과 같은 글자) */
    public static final String SUPPLY_USAGE_HISTORY = "SUPPLY_USAGE";
    private final SupplyUsageRepository repository;
    private final SupplyRepository supplyRepository;
    private final UserRepository userRepository;
    private final com.erp.common.history.ChangeHistoryService workHistoryService;

    @Transactional(readOnly = true)
    public List<SupplyUsageResponse> search(LocalDate from, LocalDate to, Long supplyItemId, Long userId) {
        LocalDate start = from != null ? from : LocalDate.now();
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_DAYS);
        return repository.findInPeriod(start, end).stream()
                .filter(u -> supplyItemId == null || u.getSupplyItem().getId().equals(supplyItemId))
                .filter(u -> userId == null || u.getUser().getId().equals(userId))
                .map(SupplyUsageResponse::from)
                .toList();
    }

    /**
     * 원본 [반복설정] 이 있으면 날마다 한 줄씩 펼쳐 넣고 같은 repeat_group 으로 묶는다(첫 줄을 돌려준다) — 원본에서
     * '매일, 2026/10/13 부터 2026/10/15 까지' 로 저장하니 목록에 13 · 14 · 15일 세 줄이 생겼다(2026-10-13 실측).
     */
    @Transactional
    public SupplyUsageResponse create(CreateSupplyUsageRequest req) {
        validateTimes(req.allDay(), req.startTime(), req.endTime());
        List<LocalDate> dates = req.repeat() == null ? List.of(req.useDate()) : ScheduleRepeat.dates(req.repeat());
        if (dates.isEmpty()) throw ApiException.badRequest("반복설정으로 만들어지는 일정이 없습니다.");
        String group = req.repeat() == null ? null : UUID.randomUUID().toString();
        String rule = req.repeat() == null ? null : req.repeat().summary();
        SupplyItem item = supplyItem(req.supplyItemId());
        User user = user(req.userId());
        SupplyUsage first = null;
        for (LocalDate d : dates) {
            SupplyUsage u = SupplyUsage.builder()
                    .supplyItem(item)
                    .user(user)
                    .useDate(d)
                    .startTime(req.allDay() ? null : req.startTime())
                    .endTime(req.allDay() ? null : req.endTime())
                    .allDay(req.allDay())
                    .title(req.title())
                    .remark(req.remark())
                    .labelText(req.labelText())
                    .returnStatus(req.returnStatus() != null ? req.returnStatus() : SupplyReturnStatus.NOT_RETURNED)
                    .repeatGroup(group)
                    .repeatRule(rule)
                    .build();
            SupplyUsage saved = repository.save(u);
            workHistoryService.record(SUPPLY_USAGE_HISTORY, saved.getId(), com.erp.common.history.ChangeHistoryService.CREATED);
            if (first == null) first = saved;
        }
        return SupplyUsageResponse.from(first);
    }

    /** 반복 줄이면 scope 만큼 같이 고친다. 여러 줄을 고칠 때 일자는 각자 그대로 둔다 — 고른 줄의 일자만 바뀐다. */
    @Transactional
    public SupplyUsageResponse update(Long id, UpdateSupplyUsageRequest req) {
        SupplyUsage target = get(id);
        SupplyItem item = req.supplyItemId() != null ? supplyItem(req.supplyItemId()) : null;
        User user = req.userId() != null ? user(req.userId()) : null;
        for (SupplyUsage u : scopeOf(target, req.scope())) {
            if (item != null) u.setSupplyItem(item);
            if (user != null) u.setUser(user);
            if (req.useDate() != null && u == target) u.setUseDate(req.useDate());
            if (req.allDay() != null) u.setAllDay(req.allDay());
            if (req.startTime() != null) u.setStartTime(req.startTime());
            if (req.endTime() != null) u.setEndTime(req.endTime());
            if (req.title() != null) u.setTitle(req.title());
            if (req.remark() != null) u.setRemark(req.remark());
            if (req.labelText() != null) u.setLabelText(req.labelText());
            if (req.returnStatus() != null) u.setReturnStatus(req.returnStatus());
            if (u.isAllDay()) { u.setStartTime(null); u.setEndTime(null); }
            validateTimes(u.isAllDay(), u.getStartTime(), u.getEndTime());
            workHistoryService.record(SUPPLY_USAGE_HISTORY, u.getId(), com.erp.common.history.ChangeHistoryService.UPDATED);
        }
        return SupplyUsageResponse.from(target);
    }

    /** 원본 공용품 조회 창 [H] '이력' — 저장할 때마다 한 줄(신규 · 수정). 이 표 전의 자료는 만든 때만 안다(작업자 빈칸). */
    @Transactional(readOnly = true)
    public List<com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse> history(Long id) {
        SupplyUsage u = get(id);
        return workHistoryService.list(SUPPLY_USAGE_HISTORY, id, null, u.getCreatedAt());
    }

    /** 원본 하단 [라벨변경] — 체크한 줄에만 붙인다(반복 묶음의 다른 줄은 그대로였다, 실측). 빈 이름이면 라벨을 뗀다. */
    @Transactional
    public void changeLabel(ChangeSupplyLabelRequest req) {
        if (req.ids() == null || req.ids().isEmpty()) {
            throw ApiException.badRequest("리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.");
        }
        String label = req.labelText() == null || req.labelText().isBlank() ? null : req.labelText().trim();
        for (Long id : req.ids()) get(id).setLabelText(label);
    }

    /** 원본 '반복일정삭제' — ONE(이번 일정만, 기본) · FOLLOWING(향후 모든 일정) · ALL(전체 반복일정). */
    @Transactional
    public void delete(Long id, String scope) {
        repository.deleteAll(scopeOf(get(id), scope));
    }

    private List<SupplyUsage> scopeOf(SupplyUsage target, String scope) {
        if (target.getRepeatGroup() == null || scope == null || "ONE".equals(scope)) return List.of(target);
        List<SupplyUsage> group = repository.findByRepeatGroup(target.getRepeatGroup());
        if ("ALL".equals(scope)) return group;
        if ("FOLLOWING".equals(scope)) {
            return group.stream().filter(u -> !u.getUseDate().isBefore(target.getUseDate())).toList();
        }
        throw ApiException.badRequest("반복일정 범위가 올바르지 않습니다: " + scope);
    }

    /** 사용내역이 걸린 공용품은 마스터에서 지우지 못하게 하려고 SupplyService 가 물어본다. */
    @Transactional(readOnly = true)
    public boolean usedBySupplyItem(Long supplyItemId) {
        return repository.existsBySupplyItemId(supplyItemId);
    }

    private SupplyUsage get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사용내역을 찾을 수 없습니다. id=" + id));
    }

    private SupplyItem supplyItem(Long id) {
        return supplyRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공용품을 찾을 수 없습니다. id=" + id));
    }

    private User user(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + id));
    }

    /** 종일이 아니면서 양쪽 시간이 다 있는데 거꾸로면 막는다. 한쪽만 비는 것은 허용(반납 전 미정). */
    private void validateTimes(boolean allDay, String start, String end) {
        if (allDay || start == null || end == null || start.isBlank() || end.isBlank()) return;
        if (end.compareTo(start) < 0) {
            throw ApiException.badRequest("종료시간이 시작시간보다 빠릅니다.");
        }
    }
}
