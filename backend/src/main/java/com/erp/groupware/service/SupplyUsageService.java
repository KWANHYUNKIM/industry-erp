package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import com.erp.groupware.domain.SupplyItem;
import com.erp.groupware.domain.SupplyUsage;
import com.erp.groupware.domain.enums.SupplyReturnStatus;
import com.erp.groupware.dto.SupplyUsageDtos.CreateSupplyUsageRequest;
import com.erp.groupware.dto.SupplyUsageDtos.SupplyUsageResponse;
import com.erp.groupware.dto.SupplyUsageDtos.UpdateSupplyUsageRequest;
import com.erp.groupware.repository.SupplyRepository;
import com.erp.groupware.repository.SupplyUsageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * 공용품 사용내역. 원본 공용품관리(E070204)는 이 기록을 기간으로 조회하는 화면이다.
 */
@Service
@RequiredArgsConstructor
public class SupplyUsageService {

    /** 기간을 안 주면 오늘부터 한 주 — 원본 기본값과 같다. */
    private static final int DEFAULT_DAYS = 6;

    private final SupplyUsageRepository repository;
    private final SupplyRepository supplyRepository;
    private final UserRepository userRepository;

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

    @Transactional
    public SupplyUsageResponse create(CreateSupplyUsageRequest req) {
        validateTimes(req.allDay(), req.startTime(), req.endTime());
        SupplyUsage u = SupplyUsage.builder()
                .supplyItem(supplyItem(req.supplyItemId()))
                .user(user(req.userId()))
                .useDate(req.useDate())
                .startTime(req.allDay() ? null : req.startTime())
                .endTime(req.allDay() ? null : req.endTime())
                .allDay(req.allDay())
                .title(req.title())
                .remark(req.remark())
                .labelText(req.labelText())
                .returnStatus(req.returnStatus() != null ? req.returnStatus() : SupplyReturnStatus.NOT_RETURNED)
                .build();
        return SupplyUsageResponse.from(repository.save(u));
    }

    @Transactional
    public SupplyUsageResponse update(Long id, UpdateSupplyUsageRequest req) {
        SupplyUsage u = get(id);
        if (req.supplyItemId() != null) u.setSupplyItem(supplyItem(req.supplyItemId()));
        if (req.userId() != null) u.setUser(user(req.userId()));
        if (req.useDate() != null) u.setUseDate(req.useDate());
        if (req.allDay() != null) u.setAllDay(req.allDay());
        if (req.startTime() != null) u.setStartTime(req.startTime());
        if (req.endTime() != null) u.setEndTime(req.endTime());
        if (req.title() != null) u.setTitle(req.title());
        if (req.remark() != null) u.setRemark(req.remark());
        if (req.labelText() != null) u.setLabelText(req.labelText());
        if (req.returnStatus() != null) u.setReturnStatus(req.returnStatus());
        if (u.isAllDay()) { u.setStartTime(null); u.setEndTime(null); }
        validateTimes(u.isAllDay(), u.getStartTime(), u.getEndTime());
        return SupplyUsageResponse.from(u);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
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
